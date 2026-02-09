from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/scheduler/status")
def scheduler_status(request: Request):
    sched = getattr(request.app.state, "scheduler", None)
    if not sched:
        return {
            "enabled": False,
            "reason": "scheduler not configured"
        }

    return {
        "enabled": True,
        **sched.status()
    }
