from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Any, Dict, List, Literal, Optional
import json

from app.db.repo_settings import get_settings, update_settings

router = APIRouter()
DEFAULT_USER_ID = "default"


class SettingsModel(BaseModel):
    role_keywords: Optional[List[str]] = None
    include_keywords: Optional[List[str]] = None
    exclude_keywords: Optional[List[str]] = None
    visa_restriction_phrases: Optional[List[str]] = None

    # Smarter filtering
    exclude_exceptions: Optional[List[str]] = None
    filter_mode: Optional[Literal["smart", "score"]] = None
    min_score_to_include: Optional[int] = None

    us_only: Optional[bool] = None
    allow_remote_us: Optional[bool] = None
    preferred_states: Optional[List[str]] = None
    work_mode: Optional[Literal["any", "remote", "hybrid", "onsite"]] = None

    uscis_h1b_years: Optional[List[int]] = None
    uscis_h1b_cache_dir: Optional[str] = None

    # Local ML relevance
    ml_enabled: Optional[bool] = None
    ml_mode: Optional[Literal["rank_only", "rescue"]] = None
    ml_rescue_threshold: Optional[float] = None


def _short_list(lst: List[str], n: int = 2) -> str:
    if not lst:
        return ""
    lst = [str(x).strip() for x in lst if str(x).strip()]
    if not lst:
        return ""
    head = lst[:n]
    more = len(lst) - len(head)
    if more > 0:
        return ", ".join(head) + f" +{more}"
    return ", ".join(head)


def _group_label(settings: Dict[str, Any]) -> str:
    roles = settings.get("role_keywords") or []
    include = settings.get("include_keywords") or []
    exclude = settings.get("exclude_keywords") or []
    visa = settings.get("visa_restriction_phrases") or []
    states = settings.get("preferred_states") or []
    work_mode = settings.get("work_mode") or "any"
    filter_mode = settings.get("filter_mode") or "smart"
    min_score = settings.get("min_score_to_include")
    us_only = bool(settings.get("us_only", True))
    remote_us = bool(settings.get("allow_remote_us", True))

    parts = []
    if roles:
        parts.append(f"Roles: {_short_list(roles)}")
    elif include:
        parts.append(f"Include: {_short_list(include)}")
    else:
        parts.append("Unfiltered")

    if exclude:
        parts.append(f"Excl: {_short_list(exclude)}")
    if visa:
        parts.append(f"Visa blocks: {len(visa)}")
    if states:
        parts.append(f"States: {len(states)}")
    parts.append(f"Mode: {work_mode}")
    if filter_mode == "score":
        parts.append(f"Score≥{min_score if min_score is not None else 3}")
    else:
        parts.append("Smart")
    parts.append("US-only" if us_only else "Any country")
    if remote_us:
        parts.append("Remote US")
    return " • ".join(parts)


@router.get("/settings")
def api_get_settings(request: Request):
    con = request.app.state.db
    return get_settings(con, DEFAULT_USER_ID)


@router.put("/settings")
def api_put_settings(payload: SettingsModel, request: Request):
    con = request.app.state.db
    return update_settings(con, DEFAULT_USER_ID, payload.model_dump(exclude_none=True))


@router.get("/settings/groups")
def api_settings_groups(request: Request):
    """Return settings groups (union buckets) based on settings_hash in run_settings."""
    con = request.app.state.db

    rows = con.execute(
        """
        SELECT rs.settings_hash, rs.run_id, r.started_at, rs.settings_json
        FROM run_settings rs
        JOIN runs r ON r.run_id = rs.run_id
        ORDER BY r.started_at DESC
        """
    ).fetchall()

    # Keep the most recent run per settings_hash
    seen = set()
    groups = []
    counts = {}

    for r in rows:
        h = r["settings_hash"]
        counts[h] = counts.get(h, 0) + 1
        if h in seen:
            continue
        seen.add(h)

        try:
            settings = json.loads(r["settings_json"]) if r["settings_json"] else {}
        except Exception:
            settings = {}

        groups.append(
            {
                "settings_hash": h,
                "label": _group_label(settings),
                "last_run_started_at": r["started_at"],
                "run_count": 0,  # fill below
                "representative_run_id": r["run_id"],
            }
        )

    for g in groups:
        g["run_count"] = counts.get(g["settings_hash"], 0)

    return groups
