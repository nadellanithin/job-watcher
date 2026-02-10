from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request


router = APIRouter()


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/overrides")
def list_overrides(
    request: Request,
    action: str = Query("all", pattern="^(all|include|exclude)$"),
    q: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=2000),
) -> Dict[str, Any]:
    con = request.app.state.db

    where = []
    params: Dict[str, Any] = {}

    if action in ("include", "exclude"):
        where.append("o.action = :action")
        params["action"] = action

    if q and q.strip():
        params["q"] = f"%{q.strip().lower()}%"
        where.append(
            "(LOWER(o.dedupe_key) LIKE :q OR LOWER(o.note) LIKE :q OR LOWER(j.title) LIKE :q OR LOWER(j.company_name) LIKE :q)"
        )

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    rows = con.execute(
        """
        SELECT
          o.dedupe_key,
          o.action,
          o.note,
          o.created_at,
          o.updated_at,
          COALESCE(j.company_name, '') AS company_name,
          COALESCE(j.title, '') AS title,
          COALESCE(j.location, '') AS location,
          COALESCE(j.url, '') AS url
        FROM job_overrides o
        LEFT JOIN jobs_latest j ON j.dedupe_key = o.dedupe_key
        """
        + where_sql
        + " ORDER BY o.updated_at DESC LIMIT :limit",
        {**params, "limit": limit},
    ).fetchall()

    return {"items": [dict(r) for r in rows]}


@router.put("/overrides/{dedupe_key}")
def upsert_override(
    request: Request,
    dedupe_key: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    con = request.app.state.db

    action = (payload.get("action") or "").strip().lower()
    if action not in ("include", "exclude"):
        raise HTTPException(status_code=400, detail="action must be 'include' or 'exclude'")

    note = (payload.get("note") or "").strip()
    now = now_utc_iso()

    con.execute(
        """
        INSERT INTO job_overrides(dedupe_key, action, note, created_at, updated_at)
        VALUES(?,?,?,?,?)
        ON CONFLICT(dedupe_key) DO UPDATE SET
          action=excluded.action,
          note=excluded.note,
          updated_at=excluded.updated_at
        """,
        (dedupe_key, action, note, now, now),
    )
    con.commit()

    return {"dedupe_key": dedupe_key, "action": action, "note": note}


@router.delete("/overrides/{dedupe_key}")
def delete_override(request: Request, dedupe_key: str) -> Dict[str, Any]:
    con = request.app.state.db
    con.execute("DELETE FROM job_overrides WHERE dedupe_key=?", (dedupe_key,))
    con.commit()
    return {"ok": True, "dedupe_key": dedupe_key}
