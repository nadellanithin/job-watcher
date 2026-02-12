from __future__ import annotations

import copy
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Request

from app.core.config import get_db_path


router = APIRouter()

_CACHE_TTL_SECONDS = 45
_cache_lock = threading.Lock()
_cache_until_monotonic = 0.0
_cache_payload: Optional[Dict[str, Any]] = None

_EXPORT_FILENAMES = (
    "jobs.json",
    "jobs.csv",
    "new_jobs.json",
    "new_jobs.csv",
)
_MODEL_FILENAMES = (
    "ml_model.joblib",
    "ml_meta.json",
)


def _quote_ident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def _list_schema_objects(con) -> List[Dict[str, str]]:
    rows = con.execute(
        """
        SELECT name, type, COALESCE(tbl_name, '') AS tbl_name
        FROM sqlite_master
        WHERE type IN ('table', 'index')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY type, name
        """
    ).fetchall()
    return [
        {
            "name": str(r["name"] or ""),
            "type": str(r["type"] or ""),
            "table_name": str(r["tbl_name"] or ""),
        }
        for r in (rows or [])
    ]


def _safe_count_table(con, table_name: str) -> int:
    try:
        row = con.execute(
            f"SELECT COUNT(*) AS c FROM {_quote_ident(table_name)}"
        ).fetchone()
        return int(row["c"] or 0) if row else 0
    except Exception:
        return 0


def _safe_count_table_where(con, table_name: str, where_sql: str) -> int:
    try:
        row = con.execute(
            f"SELECT COUNT(*) AS c FROM {_quote_ident(table_name)} WHERE {where_sql}"
        ).fetchone()
        return int(row["c"] or 0) if row else 0
    except Exception:
        return 0


def _safe_file_size(path: Optional[Path]) -> int:
    if not path:
        return 0
    try:
        if path.is_file():
            return int(path.stat().st_size)
    except Exception:
        return 0
    return 0


def _resolve_db_path(request: Request) -> Optional[Path]:
    state_path = getattr(request.app.state, "db_path", None)
    if state_path:
        p = Path(str(state_path))
        return p if p.is_absolute() else Path(os.path.abspath(str(p)))

    con = request.app.state.db
    try:
        rows = con.execute("PRAGMA database_list").fetchall()
        for r in rows or []:
            if str(r["name"] or "") != "main":
                continue
            file_path = str(r["file"] or "").strip()
            if file_path:
                p = Path(file_path)
                return p if p.is_absolute() else Path(os.path.abspath(file_path))
    except Exception:
        pass

    fallback = get_db_path()
    if not fallback:
        return None
    p = Path(str(fallback))
    return p if p.is_absolute() else Path(os.path.abspath(str(p)))


def _collect_table_metrics(con) -> Tuple[bool, List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, int]]:
    objects = _list_schema_objects(con)
    table_names = [o["name"] for o in objects if o["type"] == "table" and o["name"]]

    row_counts: Dict[str, int] = {}
    for table_name in table_names:
        row_counts[table_name] = _safe_count_table(con, table_name)

    dbstat_available = False
    object_sizes: Dict[str, int] = {}
    try:
        ds_rows = con.execute(
            "SELECT name, SUM(pgsize) AS size_bytes FROM dbstat GROUP BY name"
        ).fetchall()
        object_sizes = {
            str(r["name"]): int(r["size_bytes"] or 0)
            for r in (ds_rows or [])
            if r["name"]
        }
        dbstat_available = True
    except Exception:
        dbstat_available = False
        object_sizes = {}

    index_rows = [o for o in objects if o["type"] == "index" and o["name"]]
    indexes: List[Dict[str, Any]] = []
    indexes_size_by_table: Dict[str, int] = {}
    for idx in index_rows:
        idx_name = idx["name"]
        table_name = idx["table_name"]
        size_bytes: Optional[int] = None
        if dbstat_available:
            size_bytes = int(object_sizes.get(idx_name, 0))
            indexes_size_by_table[table_name] = (
                int(indexes_size_by_table.get(table_name, 0)) + size_bytes
            )
        indexes.append(
            {
                "name": idx_name,
                "table_name": table_name,
                "size_bytes": size_bytes,
            }
        )

    tables: List[Dict[str, Any]] = []
    for table_name in table_names:
        size_bytes: Optional[int] = None
        table_size_bytes: Optional[int] = None
        indexes_size_bytes: Optional[int] = None
        if dbstat_available:
            table_size_bytes = int(object_sizes.get(table_name, 0))
            indexes_size_bytes = int(indexes_size_by_table.get(table_name, 0))
            size_bytes = table_size_bytes + indexes_size_bytes
        tables.append(
            {
                "name": table_name,
                "row_count": int(row_counts.get(table_name, 0)),
                "size_bytes": size_bytes,
                "table_size_bytes": table_size_bytes,
                "indexes_size_bytes": indexes_size_bytes,
            }
        )

    if dbstat_available:
        tables.sort(key=lambda t: (int(t["size_bytes"] or 0), t["name"]), reverse=True)
        indexes.sort(key=lambda i: (int(i["size_bytes"] or 0), i["name"]), reverse=True)
    else:
        tables.sort(key=lambda t: (int(t["row_count"] or 0), t["name"]), reverse=True)

    return dbstat_available, tables, indexes, row_counts


def _collect_ml_footprint(base_dir: Path, feedback_rows: int) -> Dict[str, int]:
    model_dir = base_dir / ".data"
    model_size_bytes = 0
    for filename in _MODEL_FILENAMES:
        model_size_bytes += _safe_file_size(model_dir / filename)

    exports_size_bytes = 0
    for filename in _EXPORT_FILENAMES:
        exports_size_bytes += _safe_file_size(base_dir / filename)

    return {
        "feedback_rows": int(feedback_rows),
        "model_size_bytes": int(model_size_bytes),
        "exports_size_bytes": int(exports_size_bytes),
    }


def _build_storage_metrics(request: Request) -> Dict[str, Any]:
    con = request.app.state.db
    db_path = _resolve_db_path(request)

    db_size_bytes = _safe_file_size(db_path)
    wal_size_bytes = _safe_file_size(Path(f"{db_path}-wal")) if db_path else 0
    shm_size_bytes = _safe_file_size(Path(f"{db_path}-shm")) if db_path else 0

    dbstat_available, tables, indexes, row_counts = _collect_table_metrics(con)

    inbox_active_rows = _safe_count_table_where(con, "jobs_catalog", "is_active = 1")
    inbox_inactive_rows = _safe_count_table_where(con, "jobs_catalog", "is_active = 0")

    key_counts = {
        "runs_retained": int(row_counts.get("runs", 0)),
        "audit_rows": int(row_counts.get("run_job_audit", 0)),
        "inbox_active_rows": int(inbox_active_rows),
        "inbox_inactive_rows": int(inbox_inactive_rows),
        "feedback_rows": int(row_counts.get("job_feedback", 0)),
        "overrides_rows": int(row_counts.get("job_overrides", 0)),
        "companies_count": int(row_counts.get("companies", 0)),
        "jobs_latest_count": int(row_counts.get("jobs_latest", 0)),
        "jobs_seen_count": int(row_counts.get("jobs_seen", 0)),
    }

    base_dir = (db_path.parent if db_path else Path.cwd()).resolve()
    ml = _collect_ml_footprint(base_dir, key_counts["feedback_rows"])

    return {
        "generated_at_epoch_ms": int(time.time() * 1000),
        "cache_ttl_seconds": _CACHE_TTL_SECONDS,
        "db_size_bytes": int(db_size_bytes),
        "wal_size_bytes": int(wal_size_bytes),
        "shm_size_bytes": int(shm_size_bytes),
        "db_path": db_path.name if db_path else None,
        "key_counts": key_counts,
        "dbstat_available": bool(dbstat_available),
        "tables": tables,
        "indexes": indexes,
        "ml": ml,
    }


@router.get("/metrics/storage")
def storage_metrics(request: Request) -> Dict[str, Any]:
    global _cache_payload, _cache_until_monotonic

    now = time.monotonic()
    with _cache_lock:
        if _cache_payload is not None and now < _cache_until_monotonic:
            return copy.deepcopy(_cache_payload)

    payload = _build_storage_metrics(request)

    with _cache_lock:
        _cache_payload = payload
        _cache_until_monotonic = time.monotonic() + _CACHE_TTL_SECONDS

    return copy.deepcopy(payload)
