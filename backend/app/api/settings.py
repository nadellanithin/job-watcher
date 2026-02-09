from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Any, Dict, List, Literal, Optional

from app.db.repo_settings import get_settings, update_settings

router = APIRouter()
DEFAULT_USER_ID = "default"

class SettingsModel(BaseModel):
    role_keywords: Optional[List[str]] = None
    include_keywords: Optional[List[str]] = None
    exclude_keywords: Optional[List[str]] = None
    visa_restriction_phrases: Optional[List[str]] = None

    us_only: Optional[bool] = None
    allow_remote_us: Optional[bool] = None
    preferred_states: Optional[List[str]] = None
    work_mode: Optional[Literal["any","remote","hybrid","onsite"]] = None

    uscis_h1b_years: Optional[List[int]] = None
    uscis_h1b_cache_dir: Optional[str] = None

@router.get("/settings")
def api_get_settings(request: Request):
    con = request.app.state.db
    return get_settings(con, DEFAULT_USER_ID)

@router.put("/settings")
def api_put_settings(payload: SettingsModel, request: Request):
    con = request.app.state.db
    return update_settings(con, DEFAULT_USER_ID, payload.model_dump(exclude_none=True))
