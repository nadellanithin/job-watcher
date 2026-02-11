from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter()


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_ALLOWED_LABELS = {"include", "exclude", "applied", "ignore"}


@router.post("/feedback")
def create_feedback(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    con = request.app.state.db

    dedupe_key = (payload.get("dedupe_key") or "").strip()
    if not dedupe_key:
        raise HTTPException(status_code=400, detail="dedupe_key is required")

    label = (payload.get("label") or "").strip().lower()
    if label not in _ALLOWED_LABELS:
        raise HTTPException(status_code=400, detail="label must be include|exclude|applied|ignore")

    reason_category = (payload.get("reason_category") or "").strip()
    created_at = now_utc_iso()

    con.execute(
        "INSERT INTO job_feedback(dedupe_key, label, reason_category, created_at) VALUES(?,?,?,?)",
        (dedupe_key, label, reason_category, created_at),
    )
    con.commit()

    return {
        "ok": True,
        "dedupe_key": dedupe_key,
        "label": label,
        "reason_category": reason_category,
        "created_at": created_at,
    }


@router.get("/feedback")
def list_feedback(
    request: Request,
    dedupe_key: Optional[str] = Query(None),
    label: str = Query("all", pattern="^(all|include|exclude|applied|ignore)$"),
    limit: int = Query(200, ge=1, le=2000),
) -> Dict[str, Any]:
    con = request.app.state.db

    where = []
    params: Dict[str, Any] = {"limit": limit}

    if dedupe_key and dedupe_key.strip():
        where.append("dedupe_key = :dedupe_key")
        params["dedupe_key"] = dedupe_key.strip()

    if label != "all":
        where.append("label = :label")
        params["label"] = label

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    rows = con.execute(
        "SELECT id, dedupe_key, label, reason_category, created_at FROM job_feedback"
        + where_sql
        + " ORDER BY created_at DESC, id DESC LIMIT :limit",
        params,
    ).fetchall()

    return {"items": [dict(r) for r in rows]}

@router.get("/feedback/stats")
def feedback_stats(
    request: Request,
    limit: int = Query(20, ge=1, le=200),
    view: str = Query("jobs", pattern="^(jobs|events)$"),
) -> Dict[str, Any]:
    """Return lightweight summary for UI.

    The UI primarily needs:
      - counts by label
      - total events
      - distinct jobs labeled
      - a recent list

    `view` controls the recent list format:
      - events: raw feedback events (multiple rows per dedupe_key)
      - jobs: latest feedback per job (deduped), with optional job metadata
    """
    con = request.app.state.db

    counts_rows = con.execute(
        "SELECT label, COUNT(*) AS n FROM job_feedback GROUP BY label"
    ).fetchall()
    counts = {r["label"]: int(r["n"]) for r in counts_rows}

    total = int(sum(counts.values()))
    distinct_jobs_row = con.execute(
        "SELECT COUNT(DISTINCT dedupe_key) AS n FROM job_feedback"
    ).fetchone()
    distinct_jobs = int(distinct_jobs_row["n"] if distinct_jobs_row else 0)

    if view == "events":
        recent_rows = con.execute(
            "SELECT id, dedupe_key, label, reason_category, created_at FROM job_feedback "
            "ORDER BY created_at DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        recent = [dict(r) for r in recent_rows]
    else:
        # Latest feedback per job (deduped). We also surface useful job fields so
        # the UI doesn't have to show opaque dedupe keys.
        recent_rows = con.execute(
            "WITH latest AS ("
            "  SELECT dedupe_key, MAX(id) AS max_id FROM job_feedback GROUP BY dedupe_key"
            ") "
            "SELECT f.id, f.dedupe_key, f.label, f.reason_category, f.created_at, "
            "       (SELECT COUNT(*) FROM job_feedback f2 WHERE f2.dedupe_key = f.dedupe_key) AS events_count, "
            "       j.company_name AS job_company, j.title AS job_title, j.url AS job_url "
            "FROM job_feedback f "
            "JOIN latest l ON l.max_id = f.id "
            "LEFT JOIN jobs_latest j ON j.dedupe_key = f.dedupe_key "
            "ORDER BY f.created_at DESC, f.id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        recent = [dict(r) for r in recent_rows]

    return {
        "counts": counts,
        "total": total,
        "distinct_jobs": distinct_jobs,
        "view": view,
        "recent": recent,
    }


@router.delete("/feedback/{dedupe_key}")
def delete_feedback(request: Request, dedupe_key: str) -> Dict[str, Any]:
    con = request.app.state.db
    con.execute("DELETE FROM job_feedback WHERE dedupe_key = ?", (dedupe_key,))
    con.commit()
    return {"ok": True, "dedupe_key": dedupe_key}
