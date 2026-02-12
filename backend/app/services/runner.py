import io
import json
import uuid
import hashlib
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone

from app.services.dedupe import SqliteJobState, build_dedupe_key
from app.services.output_files import write_csv, write_json
from app.services.fetchers.legacy_adapter import fetch_jobs_via_legacy

from app.db.repo_companies import list_companies, update_company
from app.db.repo_settings import get_settings
from app.core.legacy_config_builder import build_legacy_config
from app.core.ml_relevance import MLRelevance


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

            ml_enabled = bool(settings.get("ml_enabled"))
            ml_mode = (settings.get("ml_mode") or "rank_only").strip().lower()
            if ml_mode not in ("rank_only", "rescue"):
                ml_mode = "rank_only"
            try:
                ml_rescue_threshold = float(settings.get("ml_rescue_threshold") if settings.get("ml_rescue_threshold") is not None else 0.92)
            except Exception:
                ml_rescue_threshold = 0.92
            try:
                ml_min_samples = int(settings.get("ml_min_samples") if settings.get("ml_min_samples") is not None else 30)
            except Exception:
                ml_min_samples = 30

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

            fetched_jobs, source_errors, h1b_errors, discovered_sources, audit_rows = fetch_jobs_via_legacy(config)

            # === Apply deterministic per-job overrides (include/exclude) ===
            # We apply overrides on the evaluated set (audit_rows) and derive the final kept list from that.
            # This avoids any risk of breaking the legacy crawler/fetcher behavior.
            #
            # Preserve H1B signal computed by legacy for the kept list. audit_rows are built
            # before H1B marking, so seed by dedupe_key to avoid defaulting everything to "no".
            h1b_by_dedupe_key = {}
            for row in fetched_jobs:
                dk = build_dedupe_key(row)
                h1b = str(row.get("past_h1b_support") or "").strip().lower()
                h1b_by_dedupe_key[dk] = h1b if h1b in ("yes", "no") else "no"

            audit_by_key = {}
            dedupe_keys = []
            for row in audit_rows:
                dk = build_dedupe_key(row)
                row["dedupe_key"] = dk
                row["past_h1b_support"] = h1b_by_dedupe_key.get(
                    dk,
                    str(row.get("past_h1b_support") or "no").strip().lower(),
                )
                audit_by_key[dk] = row
                dedupe_keys.append(dk)

            overrides = {}
            if dedupe_keys:
                # chunk to stay under SQLite variable limits
                chunk_size = 500
                for i in range(0, len(dedupe_keys), chunk_size):
                    chunk = dedupe_keys[i : i + chunk_size]
                    qmarks = ",".join(["?"] * len(chunk))
                    rows = self.con.execute(
                        f"SELECT dedupe_key, action FROM job_overrides WHERE dedupe_key IN ({qmarks})",
                        chunk,
                    ).fetchall()
                    for r in rows:
                        overrides[r["dedupe_key"]] = (r["action"] or "").strip().lower()

            for dk, row in audit_by_key.items():
                action = overrides.get(dk)
                if not action:
                    continue
                reasons = list(row.get("_audit_reasons") or [])
                if action == "include":
                    row["_audit_included"] = 1
                    reasons.append("override:force_include")
                elif action == "exclude":
                    row["_audit_included"] = 0
                    reasons.append("override:force_exclude")
                row["_audit_reasons"] = reasons

            
            # === Phase 2.6 Local ML (free): add ml_prob to audit + optional rescue ===
            ml_info = {"enabled": ml_enabled, "mode": ml_mode}

            if ml_enabled:
                try:
                    ml = MLRelevance(data_dir="./.data")

                    # Train if enough labels (latest label per job). Training may be skipped.
                    trained, train_info = ml.train_from_db(
                        self.con,
                        min_total=ml_min_samples,
                        min_pos=max(3, int(0.15 * ml_min_samples)),
                        min_neg=max(3, int(0.15 * ml_min_samples)),
                    )
                    ml_info["train"] = {"trained": bool(trained), **(train_info or {})}

                    loaded = ml.load()
                    if not loaded:
                        # deps missing / no model / other failure — keep app running.
                        reason = (train_info or {}).get("reason") or "no_model"
                        ml_info["available"] = False
                        ml_info["reason"] = reason
                        for r in audit_rows:
                            reasons = list(r.get("_audit_reasons") or [])
                            # Put the reason in audit for visibility without breaking anything.
                            reasons.append(f"ml:unavailable:{reason}")
                            r["_audit_reasons"] = reasons
                    else:
                        ml_info["available"] = True

                        # Predict proba on *this run's evaluated jobs* (includes excluded rows too).
                        probs = ml.score_audit_rows(audit_rows)

                        hard_prefixes = (
                            "location:",
                            "work_mode:",
                            "remote_us:",
                            "state:",
                            "visa_restriction:",
                        )

                        rescued = 0
                        for r in audit_rows:
                            dk = r.get("dedupe_key")
                            p = probs.get(dk)
                            if p is None:
                                continue

                            reasons = list(r.get("_audit_reasons") or [])
                            reasons.append(f"ml:prob:{p:.3f}")

                            # Rescue mode: flip only if NO hard gate reasons exist.
                            if ml_mode == "rescue" and int(r.get("_audit_included") or 0) == 0:
                                has_hard_gate = any(
                                    any(str(reason).startswith(pref) for pref in hard_prefixes)
                                    for reason in reasons
                                )
                                if (not has_hard_gate) and float(p) >= float(ml_rescue_threshold):
                                    r["_audit_included"] = 1
                                    reasons.append("ml:rescued")
                                    rescued += 1

                            r["_audit_reasons"] = reasons

                        ml_info["rescued"] = rescued

                except Exception as e:
                    # Never crash the run because ML is optional.
                    ml_info = {"enabled": True, "available": False, "error": str(e)}
                    for r in audit_rows:
                        reasons = list(r.get("_audit_reasons") or [])
                        reasons.append("ml:unavailable:error")
                        r["_audit_reasons"] = reasons

            # Final kept list after overrides (+ optional ML rescue)
            final_kept = [r for r in audit_rows if int(r.get("_audit_included") or 0) == 1]

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
            for j in final_kept:
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

            # Some override-included jobs were never in the legacy-kept list,
            # so they won't have H1B marking. Default to 'no' (historical signal only).
            for j in final_kept:
                j.setdefault("past_h1b_support", "no")

            state = SqliteJobState(self.con)
            current, new = state.upsert_and_compute_new(
                final_kept,
                run_id=None,
                settings_hash=None,
            )

            # === Persist run membership for ALL evaluated jobs (included + excluded) ===
            now = now_utc_iso()
            self.con.executemany(
                """
                INSERT INTO run_jobs(run_id, dedupe_key, included, settings_hash, matched_at)
                VALUES(?,?,?,?,?)
                ON CONFLICT(run_id, dedupe_key) DO UPDATE SET
                  included=excluded.included,
                  settings_hash=excluded.settings_hash,
                  matched_at=excluded.matched_at
                """,
                [
                    (
                        run_id,
                        r["dedupe_key"],
                        int(r.get("_audit_included") or 0),
                        settings_hash,
                        now,
                    )
                    for r in audit_rows
                ],
            )

            # === Local ML: train (if enough labels) and score latest jobs ===
            ml_info = {"enabled": ml_enabled}
            if ml_enabled:
                try:
                    ml = MLRelevance(data_dir="./.data")
                    trained, info = ml.train_from_db(self.con)
                    ml_info["train"] = {"trained": trained, **(info or {})}
                    # Score the full latest job pool (used for ordering / later rescue)
                    score_info = ml.score_jobs_latest(self.con)
                    ml_info["score"] = score_info
                except Exception as e:
                    ml_info["error"] = str(e)

            # === Persist audit rows (explainability) ===
            self.con.executemany(
                """
                INSERT INTO run_job_audit(
                  run_id, dedupe_key, included, settings_hash, created_at,
                  company_name, title, location, url, source_type, work_mode, reasons_json
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(run_id, dedupe_key) DO UPDATE SET
                  included=excluded.included,
                  settings_hash=excluded.settings_hash,
                  created_at=excluded.created_at,
                  company_name=excluded.company_name,
                  title=excluded.title,
                  location=excluded.location,
                  url=excluded.url,
                  source_type=excluded.source_type,
                  work_mode=excluded.work_mode,
                  reasons_json=excluded.reasons_json
                """,
                [
                    (
                        run_id,
                        r["dedupe_key"],
                        int(r.get("_audit_included") or 0),
                        settings_hash,
                        now,
                        r.get("company_name", ""),
                        r.get("title", ""),
                        r.get("location", ""),
                        r.get("url", ""),
                        r.get("source_type", ""),
                        r.get("work_mode", "unknown"),
                        json.dumps(r.get("_audit_reasons") or []),
                    )
                    for r in audit_rows
                ],
            )

            # === Update job_ml_scores for ordering in Jobs screens ===
            if ml_enabled:
                try:
                    ml = MLRelevance(data_dir="./.data")
                    score_info = ml.score_jobs_latest(self.con)
                    if isinstance(ml_info, dict):
                        ml_info["score"] = score_info
                except Exception as e:
                    if isinstance(ml_info, dict):
                        ml_info["score_error"] = str(e)

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
            "fetched": len(final_kept),
            "unique": len(current),
            "new": len(new),
            "source_errors": source_errors,
            "h1b_errors_count": len(h1b_errors or []),
            "settings_hash": settings_hash,
            "settings_summary": settings_summary,
            "ml": ml_info,
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
