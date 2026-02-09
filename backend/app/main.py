import os
from fastapi import FastAPI

from app.db.schema import init_db
from app.db.conn import connect

from app.api.health import router as health_router
from app.api.run import router as run_router
from app.api.jobs import router as jobs_router
from app.api.runs import router as runs_router

from app.core.scheduler import SchedulerService
from app.api.status import router as status_router

from app.api.companies import router as companies_router
from app.api.settings import router as settings_router


def create_app() -> FastAPI:
    app = FastAPI(title="Job Watcher", version="0.2.0")

    db_path = os.environ.get("DB_PATH", "./job_watcher.sqlite3")
    migration = os.path.join(os.path.dirname(__file__), "..", "migrations", "001_init.sql")
    migration = os.path.abspath(migration)

    init_db(db_path, migration)
    app.state.db = connect(db_path)

    # Scheduler attach
    scheduler = SchedulerService(app)
    app.state.scheduler = scheduler

    @app.on_event("startup")
    async def startup_event():
        await scheduler.start()

    @app.on_event("shutdown")
    async def shutdown_event():
        await scheduler.stop()

    # API routes
    app.include_router(health_router, prefix="/api")
    app.include_router(run_router, prefix="/api")
    app.include_router(jobs_router, prefix="/api")
    app.include_router(runs_router, prefix="/api")
    app.include_router(status_router, prefix="/api")
    app.include_router(companies_router, prefix="/api")
    app.include_router(settings_router, prefix="/api")

    return app


app = create_app()


# Debug endpoint to confirm env values inside the running server process
@app.get("/api/debug/env")
def debug_env():
    keys = [
        "FETCH_MAX_WORKERS",
        "CAREERURL_MAX_PAGES",
        "CAREERURL_TIME_BUDGET_S",
        "CAREERURL_LIST_TIMEOUT_S",
        "CAREERURL_NO_PROGRESS_PAGES",
        "CAREERURL_PLAYWRIGHT",
    ]
    return {k: os.getenv(k) for k in keys}
