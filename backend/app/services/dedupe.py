import hashlib
import re
from datetime import datetime, timezone

_WS = re.compile(r"\s+")

def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _norm(s: str) -> str:
    return _WS.sub(" ", (s or "").strip()).lower()

def sha1_text(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8", errors="ignore")).hexdigest()

def build_dedupe_key(job: dict) -> str:
    url = job.get("url") or ""
    if url.strip():
        return "url:" + sha1_text(_norm(url))

    job_id = job.get("job_id") or ""
    if job_id.strip():
        return f"id:{job.get('source_type','')}:{job.get('company_name','')}:{job_id}"

    fallback = f"{job.get('company_name','')}|{job.get('title','')}|{job.get('location','')}|{job.get('department','')}|{job.get('team','')}"
    return "hash:" + sha1_text(_norm(fallback))


class SqliteJobState:
    def __init__(self, con):
        self.con = con

    def upsert_and_compute_new(
        self,
        jobs: list[dict],
        *,
        run_id: str | None = None,
        settings_hash: str | None = None,
    ) -> tuple[list[dict], list[dict]]:
        """Upsert jobs into jobs_seen/jobs_latest.

        Also writes run membership into run_jobs when run_id + settings_hash are provided.
        """
        now = now_utc_iso()
        cur = self.con.cursor()

        current = []
        new = []

        for job in jobs:
            dedupe_key = build_dedupe_key(job)
            job["dedupe_key"] = dedupe_key

            row = cur.execute(
                "SELECT first_seen FROM jobs_seen WHERE dedupe_key=?",
                (dedupe_key,)
            ).fetchone()

            if row is None:
                first_seen = now
                cur.execute(
                    "INSERT INTO jobs_seen(dedupe_key, first_seen, last_seen) VALUES(?,?,?)",
                    (dedupe_key, first_seen, now)
                )
                job["first_seen"] = first_seen
                new.append(job)
            else:
                job["first_seen"] = row["first_seen"]
                cur.execute(
                    "UPDATE jobs_seen SET last_seen=? WHERE dedupe_key=?",
                    (now, dedupe_key)
                )

            cur.execute(
                """INSERT INTO jobs_latest(
                    dedupe_key, company_name, title, location, url, description,
                    department, team, date_posted, source_type, past_h1b_support, work_mode
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(dedupe_key) DO UPDATE SET
                    company_name=excluded.company_name,
                    title=excluded.title,
                    location=excluded.location,
                    url=excluded.url,
                    description=excluded.description,
                    department=excluded.department,
                    team=excluded.team,
                    date_posted=excluded.date_posted,
                    source_type=excluded.source_type,
                    past_h1b_support=excluded.past_h1b_support,
                    work_mode=excluded.work_mode
                """,
                (
                    dedupe_key,
                    job.get("company_name",""),
                    job.get("title",""),
                    job.get("location",""),
                    job.get("url",""),
                    job.get("description",""),
                    job.get("department",""),
                    job.get("team",""),
                    job.get("date_posted",""),
                    job.get("source_type",""),
                    job.get("past_h1b_support","no"),
                    job.get("work_mode","unknown"),
                )
            )

            # Record that this job was included by the run's settings
            if run_id and settings_hash:
                cur.execute(
                    """
                    INSERT INTO run_jobs(run_id, dedupe_key, included, settings_hash, matched_at)
                    VALUES(?,?,?,?,?)
                    ON CONFLICT(run_id, dedupe_key) DO UPDATE SET
                      included=excluded.included,
                      settings_hash=excluded.settings_hash,
                      matched_at=excluded.matched_at
                    """,
                    (run_id, dedupe_key, 1, settings_hash, now),
                )

            current.append(job)

        self.con.commit()
        return current, new
