from __future__ import annotations

import json
import hashlib
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, Request

from app.db.repo_settings import get_settings


router = APIRouter()



def _latest_run_id(con) -> Optional[str]:
    """
    Default Audit view should behave like "debug history":
    prefer the latest run in the *current settings_hash group* (so when filters change,
    Audit doesn't show a mixed pile), and fall back to latest overall.
    """
    try:
        settings = get_settings(con, "default") or {}
        settings_hash = hashlib.sha256(json.dumps(settings, sort_keys=True).encode("utf-8")).hexdigest()
        row = con.execute(
            "SELECT run_id FROM run_settings WHERE settings_hash=? ORDER BY created_at DESC LIMIT 1",
            (settings_hash,),
        ).fetchone()
        if row and row["run_id"]:
            return row["run_id"]
    except Exception:
        pass

    row = con.execute("SELECT run_id FROM runs ORDER BY started_at DESC LIMIT 1").fetchone()
    return row["run_id"] if row else None


@router.get("/audit")
def get_audit(
    request: Request,
    run_id: Optional[str] = Query(None, description="Run id (defaults to latest)"),
    outcome: str = Query("all", pattern="^(all|included|excluded)$"),
    q: Optional[str] = Query(None, description="Search company/title/location/url/reasons"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
) -> Dict[str, Any]:
    con = request.app.state.db

    rid = run_id or _latest_run_id(con)
    if not rid:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "meta": {"run_id": None}}

    where = ["a.run_id = :run_id"]
    params: Dict[str, Any] = {"run_id": rid}

    if outcome == "included":
        where.append("a.included = 1")
    elif outcome == "excluded":
        where.append("a.included = 0")

    if q and q.strip():
        qq = f"%{q.strip().lower()}%"
        where.append(
            """(
              LOWER(a.company_name) LIKE :q OR
              LOWER(a.title) LIKE :q OR
              LOWER(a.location) LIKE :q OR
              LOWER(a.url) LIKE :q OR
              LOWER(a.reasons_json) LIKE :q
            )"""
        )
        params["q"] = qq

    where_sql = " WHERE " + " AND ".join(where)

    total_row = con.execute("SELECT COUNT(*) AS c FROM run_job_audit a" + where_sql, params).fetchone()
    total = int(total_row["c"]) if total_row else 0

    offset = (page - 1) * page_size

    rows = con.execute(
        """
        WITH latest_feedback AS (
          SELECT f.dedupe_key, f.label, f.reason_category, f.created_at
          FROM job_feedback f
          JOIN (
            SELECT dedupe_key, MAX(id) AS max_id
            FROM job_feedback
            GROUP BY dedupe_key
          ) lf ON lf.max_id = f.id
        )
        SELECT
          a.run_id, a.dedupe_key, a.included, a.settings_hash, a.created_at,
          a.company_name, a.title, a.location, a.url, a.source_type, a.work_mode, a.reasons_json,
          o.action AS override_action,
          o.note AS override_note,
          fb.label AS feedback_label,
          fb.reason_category AS feedback_reason_category,
          fb.created_at AS feedback_created_at
        FROM run_job_audit a
        LEFT JOIN job_overrides o ON o.dedupe_key = a.dedupe_key
        LEFT JOIN latest_feedback fb ON fb.dedupe_key = a.dedupe_key
        """
        + where_sql
        + """
        ORDER BY a.created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        {**params, "limit": page_size, "offset": offset},
    ).fetchall()

    items = []
    for r in rows:
        d = dict(r)
        try:
            d["reasons"] = json.loads(d.get("reasons_json") or "[]")
        except Exception:
            d["reasons"] = []
        items.append(d)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "meta": {"run_id": rid, "outcome": outcome},
    }
