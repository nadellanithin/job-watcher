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
    if _has_table(con, "run_jobs"):
        con.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_run_jobs_run_id ON run_jobs(run_id);
            CREATE INDEX IF NOT EXISTS idx_run_jobs_settings_hash ON run_jobs(settings_hash);
            CREATE INDEX IF NOT EXISTS idx_run_jobs_dedupe_key ON run_jobs(dedupe_key);
            CREATE INDEX IF NOT EXISTS idx_run_jobs_settings_hash_included_dedupe ON run_jobs(settings_hash, included, dedupe_key);
            CREATE INDEX IF NOT EXISTS idx_run_jobs_run_id_included_dedupe ON run_jobs(run_id, included, dedupe_key);
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
    if _has_table(con, "run_settings"):
        con.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_run_settings_user_id ON run_settings(user_id);
            CREATE INDEX IF NOT EXISTS idx_run_settings_settings_hash ON run_settings(settings_hash);
            CREATE INDEX IF NOT EXISTS idx_run_settings_settings_hash_created_at ON run_settings(settings_hash, created_at DESC);
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
    if _has_table(con, "run_job_audit"):
        con.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_run_job_audit_run_id ON run_job_audit(run_id);
            CREATE INDEX IF NOT EXISTS idx_run_job_audit_included ON run_job_audit(included);
            CREATE INDEX IF NOT EXISTS idx_run_job_audit_settings_hash ON run_job_audit(settings_hash);
            CREATE INDEX IF NOT EXISTS idx_run_job_audit_run_id_created_at ON run_job_audit(run_id, created_at DESC);
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


    # job_feedback: explicit user labels for training (include/exclude/applied/ignore)
    if not _has_table(con, "job_feedback"):
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS job_feedback (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              dedupe_key TEXT NOT NULL,
              label TEXT NOT NULL CHECK(label IN ('include','exclude','applied','ignore')),
              reason_category TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_job_feedback_dedupe_key ON job_feedback(dedupe_key);
            CREATE INDEX IF NOT EXISTS idx_job_feedback_label ON job_feedback(label);
            CREATE INDEX IF NOT EXISTS idx_job_feedback_created_at ON job_feedback(created_at);
            """
        )
    if _has_table(con, "job_feedback"):
        con.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_job_feedback_dedupe_key ON job_feedback(dedupe_key);
            CREATE INDEX IF NOT EXISTS idx_job_feedback_label ON job_feedback(label);
            CREATE INDEX IF NOT EXISTS idx_job_feedback_created_at ON job_feedback(created_at);
            CREATE INDEX IF NOT EXISTS idx_job_feedback_latest_by_dedupe ON job_feedback(dedupe_key, created_at DESC, id DESC);
            """
        )

    # job_ml_scores: latest ML probability per job for ordering/rescue
    if not _has_table(con, "job_ml_scores"):
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS job_ml_scores (
              dedupe_key TEXT PRIMARY KEY,
              ml_prob REAL NOT NULL,
              model_id TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_job_ml_scores_model_id ON job_ml_scores(model_id);
            CREATE INDEX IF NOT EXISTS idx_job_ml_scores_updated_at ON job_ml_scores(updated_at);
            """
        )
    if _has_table(con, "job_ml_scores"):
        con.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_job_ml_scores_model_id ON job_ml_scores(model_id);
            CREATE INDEX IF NOT EXISTS idx_job_ml_scores_updated_at ON job_ml_scores(updated_at);
            """
        )

    if _has_table(con, "runs"):
        con.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);
            """
        )

    if _has_table(con, "jobs_seen"):
        con.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_jobs_seen_first_seen ON jobs_seen(first_seen DESC);
            CREATE INDEX IF NOT EXISTS idx_jobs_seen_last_seen ON jobs_seen(last_seen DESC);
            """
        )

    if _has_table(con, "jobs_latest"):
        con.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_jobs_latest_source_type ON jobs_latest(source_type);
            CREATE INDEX IF NOT EXISTS idx_jobs_latest_h1b ON jobs_latest(past_h1b_support);
            CREATE INDEX IF NOT EXISTS idx_jobs_latest_work_mode_ci ON jobs_latest(LOWER(COALESCE(work_mode, '')));
            """
        )
    # jobs_catalog: persistent deduped history / review queue (Inbox)
    if not _has_table(con, "jobs_catalog"):
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS jobs_catalog (
              dedupe_key TEXT PRIMARY KEY,
              company_name TEXT NOT NULL,
              title TEXT NOT NULL,
              location TEXT NOT NULL,
              url TEXT NOT NULL,
              source_type TEXT NOT NULL,
              work_mode TEXT NOT NULL,
              first_seen TEXT NOT NULL,
              last_seen TEXT NOT NULL,
              last_run_id TEXT NOT NULL,
              seen_count INTEGER NOT NULL DEFAULT 1,
              last_outcome TEXT NOT NULL DEFAULT '',
              last_reasons_json TEXT NOT NULL DEFAULT '[]',
              review_status TEXT NOT NULL DEFAULT 'unreviewed',
              is_active INTEGER NOT NULL DEFAULT 1
            );
            CREATE INDEX IF NOT EXISTS idx_jobs_catalog_last_seen ON jobs_catalog(last_seen);
            CREATE INDEX IF NOT EXISTS idx_jobs_catalog_review_status ON jobs_catalog(review_status);
            CREATE INDEX IF NOT EXISTS idx_jobs_catalog_company_name ON jobs_catalog(company_name);
            CREATE INDEX IF NOT EXISTS idx_jobs_catalog_source_type ON jobs_catalog(source_type);
            CREATE INDEX IF NOT EXISTS idx_jobs_catalog_work_mode ON jobs_catalog(work_mode);
            CREATE INDEX IF NOT EXISTS idx_jobs_catalog_is_active ON jobs_catalog(is_active);
            CREATE INDEX IF NOT EXISTS idx_jobs_catalog_active_status_last_seen ON jobs_catalog(is_active, review_status, last_seen);
            """
        )

    # jobs_catalog.is_active: TTL/archive window without deleting ML memory rows.
    if _has_table(con, "jobs_catalog") and not _has_column(con, "jobs_catalog", "is_active"):
        con.execute("ALTER TABLE jobs_catalog ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")

    if _has_table(con, "jobs_catalog"):
        con.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_jobs_catalog_is_active ON jobs_catalog(is_active);
            CREATE INDEX IF NOT EXISTS idx_jobs_catalog_active_status_last_seen ON jobs_catalog(is_active, review_status, last_seen);
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
