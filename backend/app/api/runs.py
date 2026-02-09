from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/runs")
def runs(request: Request):
    con = request.app.state.db
    rows = con.execute("""
        SELECT run_id, started_at, finished_at, stats_json
        FROM runs
        ORDER BY started_at DESC
        LIMIT 50
    """).fetchall()
    return [dict(r) for r in rows]
