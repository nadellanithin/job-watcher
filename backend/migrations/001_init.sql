PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS jobs_seen (
  dedupe_key TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs_latest (
  dedupe_key TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL,
  department TEXT,
  team TEXT,
  date_posted TEXT,
  source_type TEXT NOT NULL,
  past_h1b_support TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  stats_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  employer_name TEXT,
  sources_json TEXT NOT NULL,
  source_priority_json TEXT NOT NULL,
  fetch_mode TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL
);
