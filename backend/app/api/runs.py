from fastapi import APIRouter, Request, HTTPException

router = APIRouter()


@router.get("/runs")
def runs(request: Request):
    con = request.app.state.db
    rows = con.execute(
        """
        SELECT run_id, started_at, finished_at, stats_json
        FROM runs
        ORDER BY started_at DESC
        LIMIT 50
        """
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/runs/{run_id}/settings")
def run_settings(request: Request, run_id: str):
    con = request.app.state.db
    row = con.execute(
        """
        SELECT run_id, user_id, settings_hash, settings_json, created_at
        FROM run_settings
        WHERE run_id=?
        """,
        (run_id,),
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="settings snapshot not found for this run")

    return dict(row)
