from fastapi import APIRouter, Request, Query

router = APIRouter()

@router.get("/jobs")
def get_jobs(request: Request, scope: str = Query("new", pattern="^(new|all)$")):
    con = request.app.state.db
    if scope == "new":
        # simplest: read from output file equivalent by querying seen where first_seen == last_seen recently is tricky
        # For now, just return all jobs_latest sorted by first_seen
        rows = con.execute("""
            SELECT jl.*, js.first_seen
            FROM jobs_latest jl
            JOIN jobs_seen js ON js.dedupe_key = jl.dedupe_key
            ORDER BY js.first_seen DESC
            LIMIT 500
        """).fetchall()
    else:
        rows = con.execute("""
            SELECT jl.*, js.first_seen
            FROM jobs_latest jl
            JOIN jobs_seen js ON js.dedupe_key = jl.dedupe_key
            ORDER BY js.first_seen DESC
            LIMIT 5000
        """).fetchall()

    return [dict(r) for r in rows]
