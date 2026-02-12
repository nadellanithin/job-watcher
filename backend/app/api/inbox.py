
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, Request

from app.core.config import get_runtime_config
from app.services.inbox_retention import deactivate_expired_jobs


router = APIRouter()


_ALLOWED_STATUS = {"unreviewed", "include", "exclude", "ignore", "all"}


def _parse_iso(s: str) -> Optional[str]:
    s = (s or "").strip()
    if not s:
        return None
    try:
        # validate-ish
        datetime.fromisoformat(s.replace("Z", "+00:00"))
        return s
    except Exception:
        return None


def _apply_active_ttl(con) -> None:
    cfg = get_runtime_config()
    changed = deactivate_expired_jobs(con, ttl_days=cfg.inbox_active_ttl_days)
    if changed > 0:
        con.commit()


@router.get("/inbox")
def list_inbox(
    request: Request,
    status: str = Query("unreviewed", pattern="^(unreviewed|include|exclude|ignore|all)$"),
    include_inactive: bool = Query(False, description="When true, include inactive archived rows"),
    q: str = Query("", description="Search company/title/location/url"),
    company: str = Query("", description="Filter by company_name (contains)"),
    source: str = Query("", description="Filter by source_type"),
    work_mode: str = Query("", description="Filter by work_mode"),
    seen_since: str = Query("", description="Filter by last_seen >= ISO timestamp"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=200),
) -> Dict[str, Any]:
    con = request.app.state.db
    _apply_active_ttl(con)

    where = []
    params: Dict[str, Any] = {}

    if status != "all" and not include_inactive:
        where.append("c.is_active = 1")

    if status != "all":
        where.append("c.review_status = :status")
        params["status"] = status

    if q and q.strip():
        qq = f"%{q.strip().lower()}%"
        where.append(
            """(
              LOWER(c.company_name) LIKE :q OR
              LOWER(c.title) LIKE :q OR
              LOWER(c.location) LIKE :q OR
              LOWER(c.url) LIKE :q
            )"""
        )
        params["q"] = qq

    if company and company.strip():
        params["company"] = f"%{company.strip().lower()}%"
        where.append("LOWER(c.company_name) LIKE :company")

    if source and source.strip():
        params["source"] = source.strip()
        where.append("c.source_type = :source")

    if work_mode and work_mode.strip():
        params["work_mode"] = work_mode.strip()
        where.append("c.work_mode = :work_mode")

    ss = _parse_iso(seen_since)
    if ss:
        params["seen_since"] = ss
        where.append("c.last_seen >= :seen_since")

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    total_row = con.execute("SELECT COUNT(*) AS c FROM jobs_catalog c" + where_sql, params).fetchone()
    total = int(total_row["c"]) if total_row else 0

    offset = (page - 1) * page_size
    params2 = dict(params)
    params2["limit"] = page_size
    params2["offset"] = offset

    rows = con.execute(
        """
        WITH latest_feedback AS (
          SELECT f.dedupe_key, f.label
          FROM job_feedback f
          JOIN (
            SELECT dedupe_key, MAX(id) AS max_id
            FROM job_feedback
            GROUP BY dedupe_key
          ) lf ON lf.max_id = f.id
        )
        SELECT
          c.dedupe_key, c.company_name, c.title, c.location, c.url, c.source_type, c.work_mode,
          c.first_seen, c.last_seen, c.last_run_id, c.seen_count,
          c.last_outcome, c.last_reasons_json, c.review_status, c.is_active,
          o.action AS override_action,
          o.note AS override_note,
          fb.label AS feedback_label,
          m.ml_prob AS ml_prob,
          m.updated_at AS ml_updated_at
        FROM jobs_catalog c
        LEFT JOIN job_overrides o ON o.dedupe_key = c.dedupe_key
        LEFT JOIN job_ml_scores m ON m.dedupe_key = c.dedupe_key
        LEFT JOIN latest_feedback fb ON fb.dedupe_key = c.dedupe_key
        """
        + where_sql
        + """
        ORDER BY c.last_seen DESC, c.seen_count DESC
        LIMIT :limit OFFSET :offset
        """,
        params2,
    ).fetchall()

    items = []
    for r in rows or []:
        reasons = []
        try:
            reasons = json.loads(r["last_reasons_json"] or "[]")
        except Exception:
            reasons = []
        items.append(
            {
                "dedupe_key": r["dedupe_key"],
                "company_name": r["company_name"],
                "title": r["title"],
                "location": r["location"],
                "url": r["url"],
                "source_type": r["source_type"],
                "work_mode": r["work_mode"],
                "first_seen": r["first_seen"],
                "last_seen": r["last_seen"],
                "last_run_id": r["last_run_id"],
                "seen_count": int(r["seen_count"] or 0),
                "last_outcome": r["last_outcome"] or "",
                "reasons": reasons,
                "review_status": r["review_status"] or "unreviewed",
                "is_active": bool(int(r["is_active"] or 0)),
                "override_action": r["override_action"],
                "override_note": r["override_note"] or "",
                "feedback_label": r["feedback_label"],
                "ml_prob": r["ml_prob"],
                "ml_updated_at": r["ml_updated_at"],
            }
        )

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/inbox/stats")
def inbox_stats(
    request: Request,
    include_inactive: bool = Query(False, description="When true, include inactive archived rows"),
) -> Dict[str, Any]:
    con = request.app.state.db
    _apply_active_ttl(con)
    where_sql = "" if include_inactive else " WHERE is_active = 1"
    rows = con.execute(
        """
        SELECT review_status, COUNT(*) AS c
        FROM jobs_catalog
        """
        + where_sql
        + """
        GROUP BY review_status
        """
    ).fetchall()
    out = {"unreviewed": 0, "include": 0, "exclude": 0, "ignore": 0, "all": 0}
    total = 0
    for r in rows or []:
        k = (r["review_status"] or "").strip().lower()
        c = int(r["c"] or 0)
        total += c
        if k in out:
            out[k] += c
    out["all"] = total
    return out
