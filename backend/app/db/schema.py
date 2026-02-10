import sqlite3
from pathlib import Path


def _has_column(con: sqlite3.Connection, table: str, column: str) -> bool:
    rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)  # r[1] = name


def _has_table(con: sqlite3.Connection, table: str) -> bool:
    row = con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return bool(row)


def _ensure_schema(con: sqlite3.Connection) -> None:
    """Idempotent upgrades for older DBs."""

    # jobs_latest.work_mode (needed for work-mode filtering + display)
    if _has_table(con, "jobs_latest") and not _has_column(con, "jobs_latest", "work_mode"):
        con.execute("ALTER TABLE jobs_latest ADD COLUMN work_mode TEXT")

    # run_jobs: job membership per run (enables settings-group unions)
    if not _has_table(con, "run_jobs"):
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS run_jobs (
              run_id TEXT NOT NULL,
              dedupe_key TEXT NOT NULL,
              included INTEGER NOT NULL,
              settings_hash TEXT NOT NULL,
              matched_at TEXT NOT NULL,
              PRIMARY KEY(run_id, dedupe_key)
            );
            CREATE INDEX IF NOT EXISTS idx_run_jobs_run_id ON run_jobs(run_id);
            CREATE INDEX IF NOT EXISTS idx_run_jobs_settings_hash ON run_jobs(settings_hash);
            CREATE INDEX IF NOT EXISTS idx_run_jobs_dedupe_key ON run_jobs(dedupe_key);
            """
        )

    # run_settings: snapshot of settings used for each run (human-readable receipts)
    if not _has_table(con, "run_settings"):
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS run_settings (
              run_id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              settings_hash TEXT NOT NULL,
              settings_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_run_settings_user_id ON run_settings(user_id);
            CREATE INDEX IF NOT EXISTS idx_run_settings_settings_hash ON run_settings(settings_hash);
            """
        )

    # run_job_audit: per-run explainability (included/excluded + reasons)
    if not _has_table(con, "run_job_audit"):
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS run_job_audit (
              run_id TEXT NOT NULL,
              dedupe_key TEXT NOT NULL,
              included INTEGER NOT NULL,
              settings_hash TEXT NOT NULL,
              created_at TEXT NOT NULL,
              company_name TEXT NOT NULL,
              title TEXT NOT NULL,
              location TEXT NOT NULL,
              url TEXT NOT NULL,
              source_type TEXT NOT NULL,
              work_mode TEXT NOT NULL,
              reasons_json TEXT NOT NULL,
              PRIMARY KEY(run_id, dedupe_key)
            );
            CREATE INDEX IF NOT EXISTS idx_run_job_audit_run_id ON run_job_audit(run_id);
            CREATE INDEX IF NOT EXISTS idx_run_job_audit_included ON run_job_audit(included);
            CREATE INDEX IF NOT EXISTS idx_run_job_audit_settings_hash ON run_job_audit(settings_hash);
            """
        )

    # job_overrides: user overrides for a specific job (by dedupe_key)
    if not _has_table(con, "job_overrides"):
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS job_overrides (
              dedupe_key TEXT PRIMARY KEY,
              action TEXT NOT NULL CHECK(action IN ('include','exclude')),
              note TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_job_overrides_action ON job_overrides(action);
            """
        )


def init_db(db_path: str, migration_sql_path: str) -> None:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    try:
        with open(migration_sql_path, "r", encoding="utf-8") as f:
            con.executescript(f.read())

        _ensure_schema(con)

        con.commit()
    finally:
        con.close()
