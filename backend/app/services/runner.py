import io
import json
import uuid
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


class RunnerService:
    def __init__(self, con):
        self.con = con

    def run_once(self) -> dict:
        started = now_utc_iso()

        # Capture all stdout/stderr logs during run (legacy fetcher prints)
        buf = io.StringIO()

        with redirect_stdout(buf), redirect_stderr(buf):
            settings = get_settings(self.con, "default")

            # Build legacy sources list from DB companies (match legacy config format)
            companies = list_companies(self.con, "default")

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
                                    # per-company mode controlled via UI: requests|playwright
                                    "mode": (src.get("mode") or "requests").strip().lower(),
                                    "employer_name": employer_name,
                                }
                            )

            config = build_legacy_config(settings, legacy_sources)

            fetched_jobs, source_errors, h1b_errors, discovered_sources = fetch_jobs_via_legacy(config)

            # Persist ATS discoveries so career_url wrappers (like cedar.com/open-roles)
            # get upgraded to a first-class GH/Lever source after the first successful run.
            # This makes future runs faster and more reliable.
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
                        # If the ATS source is already present, do nothing.
                        already = any(
                            (s.get("type") or "").strip().lower() == stype and (s.get("slug") or "").strip() == slug
                            for s in sources
                        )
                        if already:
                            continue

                        sources.append({"type": stype, "slug": slug})

                        # Remove the specific career_url that led to the discovery so we stop scraping it.
                        # This is the "upgrade" behavior you want (career_url -> GH/Lever).
                        if from_url:
                            sources = [
                                s
                                for s in sources
                                if not (
                                    (s.get("type") or "").strip().lower() == "career_url"
                                    and (s.get("url") or "").strip() == from_url
                                )
                            ]

                        # Prefer the discovered ATS over career_url in priority ordering.
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
                        update_company(self.con, c["id"], c.get("user_id") or "default", updated_payload)
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

            state = SqliteJobState(self.con)
            current, new = state.upsert_and_compute_new(fetched_jobs)

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

        # Store logs + errors in stats_json so /api/runs can show them too
        stats = {
            "fetched": len(fetched_jobs),
            "unique": len(current),
            "new": len(new),
            "source_errors": source_errors,
            "h1b_errors_count": len(h1b_errors or []),
            "logs": logs,
        }

        run_id = str(uuid.uuid4())
        self.con.execute(
            "INSERT INTO runs(run_id, started_at, finished_at, stats_json) VALUES(?,?,?,?)",
            (run_id, started, finished, json.dumps(stats)),
        )
        self.con.commit()

        # Return logs for immediate UI display
        return {
            "run_id": run_id,
            "started_at": started,
            "finished_at": finished,
            "stats": stats,
            "logs": logs,
        }
