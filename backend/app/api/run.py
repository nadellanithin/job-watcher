from fastapi import APIRouter, Request
from app.services.runner import RunnerService

router = APIRouter()

@router.post("/run")
def run_now(request: Request):
    runner = RunnerService(request.app.state.db)
    result = runner.run_once()
    return {"ok": True, **result}
