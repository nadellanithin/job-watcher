from fastapi import APIRouter, Request, Query
from typing import Optional, Dict, Any, Tuple

router = APIRouter()


def _latest_run_info(con) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Returns (run_id, started_at, finished_at) for latest run.
    started_at/finished_at are stored as ISO strings in DB.
    """
    row = con.execute(
        "SELECT run_id, started_at, finished_at FROM runs ORDER BY started_at DESC LIMIT 1"
    ).fetchone()
    if not row:
        return None, None, None
    return row["run_id"], row["started_at"], row["finished_at"]


def _build_where(
    *,
    scope: str,
    settings_hash: Optional[str],
    source: str,
    work_mode: str,
    h1b_only: bool,
    q: Optional[str],
    latest_run_id: Optional[str],
    latest_run_started_at: Optional[str],
    latest_run_finished_at: Optional[str],
) -> Tuple[str, Dict[str, Any]]:
    where = []
    params: Dict[str, Any] = {}

    if scope == "settings":
        if not settings_hash:
            where.append("1=0")
        else:
            where.append(
                """EXISTS (
                    SELECT 1 FROM run_jobs rj
                    WHERE rj.dedupe_key = jl.dedupe_key
                      AND rj.included = 1
                      AND rj.settings_hash = :settings_hash
                )"""
            )
            params["settings_hash"] = settings_hash

    elif scope == "new":
        # ✅ True "new": first_seen happened during latest run window AND was included by latest run
        if not latest_run_id or not latest_run_started_at:
            where.append("1=0")
        else:
            where.append(
                """EXISTS (
                    SELECT 1 FROM run_jobs rj
                    WHERE rj.dedupe_key = jl.dedupe_key
                      AND rj.included = 1
                      AND rj.run_id = :latest_run_id
                )"""
            )
            params["latest_run_id"] = latest_run_id

            # first_seen is set when the job is first inserted (i.e., newly discovered)
            where.append("js.first_seen >= :run_started_at")
            params["run_started_at"] = latest_run_started_at

            # finished_at might be null in edge cases; if present, tighten the window
            if latest_run_finished_at:
                where.append("js.first_seen <= :run_finished_at")
                params["run_finished_at"] = latest_run_finished_at

    # scope == "all" => no base constraint

    if source and source != "all":
        where.append("jl.source_type = :source")
        params["source"] = source

    if work_mode and work_mode != "any":
        where.append("LOWER(COALESCE(jl.work_mode, '')) = :work_mode")
        params["work_mode"] = work_mode.lower()

    if h1b_only:
        where.append("jl.past_h1b_support = 'yes'")

    if q and q.strip():
        qq = f"%{q.strip().lower()}%"
        where.append(
            """(
              LOWER(jl.company_name) LIKE :q OR
              LOWER(jl.title) LIKE :q OR
              LOWER(jl.location) LIKE :q OR
              LOWER(COALESCE(jl.department,'')) LIKE :q OR
              LOWER(COALESCE(jl.team,'')) LIKE :q OR
              LOWER(jl.url) LIKE :q
            )"""
        )
        params["q"] = qq

    if not where:
        return "", params
    return " WHERE " + " AND ".join(where), params


@router.get("/jobs")
def jobs(
    request: Request,
    scope: str = Query("new", pattern="^(new|all|settings)$"),
    settings_hash: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    source: str = Query("all"),
    work_mode: str = Query("any"),
    h1b_only: int = Query(0),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
):
    con = request.app.state.db

    latest_run_id, latest_run_started_at, latest_run_finished_at = _latest_run_info(con)

    where_sql, params = _build_where(
        scope=scope,
        settings_hash=settings_hash,
        source=source,
        work_mode=work_mode,
        h1b_only=bool(h1b_only),
        q=q,
        latest_run_id=latest_run_id,
        latest_run_started_at=latest_run_started_at,
        latest_run_finished_at=latest_run_finished_at,
    )

    total_row = con.execute(
        """SELECT COUNT(*) AS c
           FROM jobs_latest jl
           JOIN jobs_seen js ON js.dedupe_key = jl.dedupe_key
        """ + where_sql,
        params,
    ).fetchone()
    total = int(total_row["c"]) if total_row else 0

    offset = (page - 1) * page_size

    rows = con.execute(
        """SELECT
            jl.dedupe_key,
            jl.company_name,
            jl.title,
            jl.location,
            jl.url,
            jl.description,
            jl.department,
            jl.team,
            jl.date_posted,
            jl.source_type,
            jl.past_h1b_support,
            COALESCE(jl.work_mode, 'unknown') AS work_mode,
            js.first_seen,
            js.last_seen
        FROM jobs_latest jl
        JOIN jobs_seen js ON js.dedupe_key = jl.dedupe_key
        """ + where_sql + """
        ORDER BY js.first_seen DESC
        LIMIT :limit OFFSET :offset
        """,
        {**params, "limit": page_size, "offset": offset},
    ).fetchall()

    items = [dict(r) for r in rows]

    # Facets should match the same scope, but ignore source/work_mode to show available options
    facet_where_sql, facet_params = _build_where(
        scope=scope,
        settings_hash=settings_hash,
        source="all",
        work_mode="any",
        h1b_only=bool(h1b_only),
        q=None,
        latest_run_id=latest_run_id,
        latest_run_started_at=latest_run_started_at,
        latest_run_finished_at=latest_run_finished_at,
    )

    src_rows = con.execute(
        """SELECT DISTINCT jl.source_type AS v
           FROM jobs_latest jl
           JOIN jobs_seen js ON js.dedupe_key = jl.dedupe_key
        """ + facet_where_sql + """
           ORDER BY v
        """,
        facet_params,
    ).fetchall()
    wm_rows = con.execute(
        """SELECT DISTINCT LOWER(COALESCE(jl.work_mode, 'unknown')) AS v
           FROM jobs_latest jl
           JOIN jobs_seen js ON js.dedupe_key = jl.dedupe_key
        """ + facet_where_sql + """
           ORDER BY v
        """,
        facet_params,
    ).fetchall()

    facets = {
        "sources": [r["v"] for r in src_rows if r["v"]],
        "work_modes": [r["v"] for r in wm_rows if r["v"]],
    }

    meta = {
        "scope": scope,
        "latest_run_id": latest_run_id,
        "latest_run_started_at": latest_run_started_at,
        "latest_run_finished_at": latest_run_finished_at,
    }
    if settings_hash:
        meta["settings_hash"] = settings_hash

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "facets": facets,
        "meta": meta,
    }
