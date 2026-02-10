import io
import json
import uuid
import hashlib
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone

from app.services.dedupe import SqliteJobState
from app.services.output_files import write_csv, write_json
from app.services.fetchers.legacy_adapter import fetch_jobs_via_legacy

from app.db.repo_companies import list_companies, update_company
from app.db.repo_settings import get_settings
from app.core.legacy_config_builder import build_legacy_config


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _truncate(s: str, max_chars: int = 20000) -> str:
    s = s or ""
    if len(s) <= max_chars:
        return s
    return s[:max_chars] + "\n... (truncated)\n"


def _take(lst, n=8):
    return (lst or [])[:n]


class RunnerService:
    def __init__(self, con):
        self.con = con

    def run_once(self) -> dict:
        started = now_utc_iso()
        user_id = "default"

        # Create run_id early so downstream can write membership rows
        run_id = str(uuid.uuid4())

        # Capture all stdout/stderr logs during run (legacy fetcher prints)
        buf = io.StringIO()

        with redirect_stdout(buf), redirect_stderr(buf):
            settings = get_settings(self.con, user_id)

            # Stable fingerprint of settings that drove this run.
            settings_hash = hashlib.sha256(
                json.dumps(settings or {}, sort_keys=True).encode("utf-8")
            ).hexdigest()

            # High-signal summary for UI (avoid dumping full JSON everywhere)
            settings_summary = {
                "role_keywords": _take(settings.get("role_keywords")),
                "include_keywords": _take(settings.get("include_keywords")),
                "exclude_keywords": _take(settings.get("exclude_keywords")),
                "visa_restriction_phrases": _take(settings.get("visa_restriction_phrases")),
                "counts": {
                    "role_keywords": len(settings.get("role_keywords") or []),
                    "include_keywords": len(settings.get("include_keywords") or []),
                    "exclude_keywords": len(settings.get("exclude_keywords") or []),
                    "visa_restriction_phrases": len(settings.get("visa_restriction_phrases") or []),
                    "preferred_states": len(settings.get("preferred_states") or []),
                    "uscis_h1b_years": len(settings.get("uscis_h1b_years") or []),
                },
                "flags": {
                    "us_only": bool(settings.get("us_only")),
                    "allow_remote_us": bool(settings.get("allow_remote_us")),
                    "work_mode": settings.get("work_mode") or "any",
                },
                "uscis_h1b_years": settings.get("uscis_h1b_years") or [],
                "preferred_states": _take(settings.get("preferred_states"), n=10),
            }

            companies = list_companies(self.con, user_id)

            legacy_sources = []
            for c in companies:
                company_label = c.get("company_name") or ""
                employer_name = (c.get("employer_name") or company_label or "").strip()

                for src in (c.get("sources") or []):
                    src_type = (src.get("type") or "").strip().lower()

                    if src_type in ("greenhouse", "lever"):
                        slug = (src.get("slug") or "").strip()
                        if slug:
                            legacy_sources.append(
                                {
                                    "type": src_type,
                                    "company_slug": slug,
                                    "label": company_label,
                                    "employer_name": employer_name,
                                }
                            )

                    elif src_type == "career_url":
                        url = (src.get("url") or "").strip()
                        if url:
                            legacy_sources.append(
                                {
                                    "type": "career_url",
                                    "url": url,
                                    "label": company_label,
                                    "mode": (src.get("mode") or "requests").strip().lower(),
                                    "employer_name": employer_name,
                                }
                            )

            config = build_legacy_config(settings, legacy_sources)

            fetched_jobs, source_errors, h1b_errors, discovered_sources = fetch_jobs_via_legacy(config)

            # Persist ATS discoveries (optional upgrade path: career_url -> greenhouse/lever)
            if discovered_sources:
                companies_by_name = {((c.get("company_name") or "").strip().lower()): c for c in companies}
                for d in discovered_sources:
                    try:
                        name = (d.get("company_name") or "").strip()
                        key = name.lower()
                        stype = (d.get("source_type") or "").strip().lower()
                        slug = (d.get("slug") or "").strip()
                        from_url = (d.get("from_url") or "").strip()
                        if not name or stype not in ("greenhouse", "lever") or not slug:
                            continue

                        c = companies_by_name.get(key)
                        if not c:
                            continue

                        sources = list(c.get("sources") or [])
                        already = any(
                            (s.get("type") or "").strip().lower() == stype and (s.get("slug") or "").strip() == slug
                            for s in sources
                        )
                        if already:
                            continue

                        sources.append({"type": stype, "slug": slug})

                        if from_url:
                            sources = [
                                s for s in sources
                                if not (
                                    (s.get("type") or "").strip().lower() == "career_url"
                                    and (s.get("url") or "").strip() == from_url
                                )
                            ]

                        priority = list(c.get("source_priority") or [])
                        if stype in priority:
                            priority = [p for p in priority if p != stype]
                        priority.insert(0, stype)

                        updated_payload = {
                            "company_name": c.get("company_name"),
                            "employer_name": c.get("employer_name"),
                            "sources": sources,
                            "source_priority": priority,
                            "fetch_mode": c.get("fetch_mode"),
                        }
                        update_company(self.con, c["id"], c.get("user_id") or user_id, updated_payload)
                        print(f"[discovery][{name}] upgraded_to={stype} slug={slug} removed_career_url={bool(from_url)}")
                    except Exception as e:
                        print(f"[discovery] persist failed err={e}")

            if source_errors:
                print("Source errors:", source_errors)
            if h1b_errors:
                print("H1B load errors (first 3):", (h1b_errors or [])[:3])

            # Ensure required fields (safe defaults)
            for j in fetched_jobs:
                j.setdefault("company_name", "")
                j.setdefault("job_id", "")
                j.setdefault("title", "")
                j.setdefault("location", "")
                j.setdefault("department", "")
                j.setdefault("team", "")
                j.setdefault("url", "")
                j.setdefault("description", "")
                j.setdefault("date_posted", "")
                j.setdefault("source_type", "")
                j.setdefault("past_h1b_support", "no")
                j.setdefault("work_mode", "unknown")

            state = SqliteJobState(self.con)
            current, new = state.upsert_and_compute_new(
                fetched_jobs,
                run_id=run_id,
                settings_hash=settings_hash,
            )

            # Sort (H1B first, then first_seen)
            current.sort(
                key=lambda x: (0 if x.get("past_h1b_support") == "yes" else 1, x.get("first_seen", ""))
            )
            new.sort(
                key=lambda x: (0 if x.get("past_h1b_support") == "yes" else 1, x.get("first_seen", ""))
            )

            # Output files (non-negotiable)
            write_json("./jobs.json", current)
            write_csv("./jobs.csv", current)
            write_json("./new_jobs.json", new)
            write_csv("./new_jobs.csv", new)

        finished = now_utc_iso()

        logs = _truncate(buf.getvalue(), max_chars=20000)

        stats = {
            "fetched": len(fetched_jobs),
            "unique": len(current),
            "new": len(new),
            "source_errors": source_errors,
            "h1b_errors_count": len(h1b_errors or []),
            "settings_hash": settings_hash,
            "settings_summary": settings_summary,
            "logs": logs,
        }

        self.con.execute(
            "INSERT INTO runs(run_id, started_at, finished_at, stats_json) VALUES(?,?,?,?)",
            (run_id, started, finished, json.dumps(stats)),
        )

        # Persist settings snapshot for this run
        try:
            self.con.execute(
                """
                INSERT INTO run_settings(run_id, user_id, settings_hash, settings_json, created_at)
                VALUES(?,?,?,?,?)
                ON CONFLICT(run_id) DO UPDATE SET
                  user_id=excluded.user_id,
                  settings_hash=excluded.settings_hash,
                  settings_json=excluded.settings_json,
                  created_at=excluded.created_at
                """,
                (run_id, user_id, settings_hash, json.dumps(settings or {}), finished),
            )
        except Exception:
            pass

        self.con.commit()

        return {
            "run_id": run_id,
            "started_at": started,
            "finished_at": finished,
            "stats": stats,
            "logs": logs,
        }
