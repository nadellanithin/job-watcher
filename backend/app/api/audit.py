from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, Request


router = APIRouter()


def _latest_run_id(con) -> Optional[str]:
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
        SELECT
          a.run_id, a.dedupe_key, a.included, a.settings_hash, a.created_at,
          a.company_name, a.title, a.location, a.url, a.source_type, a.work_mode, a.reasons_json,
          o.action AS override_action,
          o.note AS override_note
        FROM run_job_audit a
        LEFT JOIN job_overrides o ON o.dedupe_key = a.dedupe_key
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
