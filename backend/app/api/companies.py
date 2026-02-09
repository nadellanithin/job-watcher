from typing import List, Optional, Literal, Any, Dict
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field

from app.db.repo_companies import (
    list_companies,
    get_company,
    create_company,
    update_company,
    delete_company,
)

from app.core.source_discovery import discover_sources, merge_sources

router = APIRouter()

# For now we run single-user mode
DEFAULT_USER_ID = "default"

SourceType = Literal["career_url", "greenhouse", "lever"]
CareerMode = Literal["requests", "playwright"]


class CompanySourceModel(BaseModel):
    type: SourceType
    slug: Optional[str] = None
    url: Optional[str] = None
    mode: Optional[CareerMode] = None
    notes: str = ""


class CompanyModel(BaseModel):
    company_name: str = Field(min_length=1)
    employer_name: Optional[str] = None
    sources: List[CompanySourceModel] = Field(default_factory=list)
    source_priority: List[SourceType] = Field(default_factory=lambda: ["career_url", "greenhouse", "lever"])
    fetch_mode: Literal["all", "fallback"] = "all"


class DiscoverRequest(BaseModel):
    """Discovery request.

    If `career_url` is provided, we attempt ATS detection (GH/Lever) and also
    include `career_url` itself as a recommended source.

    If `company_name` is omitted, we use the company name from DB.
    """

    company_name: Optional[str] = None
    career_url: Optional[str] = None

    # Verification tuning (bounded defaults)
    max_slug_guesses: int = 10
    verify_workers: int = 8
    verify_timeout_s: float = 6.0
    page_timeout_s: float = 8.0
    # NEW:
    discovery_mode: Literal["validate_existing", "expand"] = "validate_existing"


class ApplyDiscoveryRequest(BaseModel):
    """Apply verified/recommended sources to the company."""
    sources: Optional[List[CompanySourceModel]] = None


@router.post("/companies/{company_id}/discover")
def api_discover_company_sources(company_id: str, payload: DiscoverRequest, request: Request) -> Dict[str, Any]:
    """Discover and verify sources for a company.

    Returns:
      - candidates: all checked candidates (verified or not)
      - recommended: a conservative recommended set (verified GH/Lever + career_url)

    This endpoint does NOT modify the company record.
    """
    con = request.app.state.db
    c = get_company(con, company_id, DEFAULT_USER_ID)
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")

    company_name = payload.company_name or c.get("company_name")
    career_url = payload.career_url
    if not career_url:
        # If company already has a career_url source, prefer that.
        for s in (c.get("sources") or []):
            if (s.get("type") == "career_url") and s.get("url"):
                career_url = s.get("url")
                break

    if not company_name:
        raise HTTPException(status_code=400, detail="company_name is required")
    
    # NEW: seed discovery with existing sources so slugs you've already provided are validated first
    seed_sources = []
    for s in (c.get("sources") or []):
        if s.get("type") in ("greenhouse", "lever") and s.get("slug"):
            seed_sources.append({"type": s.get("type"), "slug": s.get("slug")})

    result = discover_sources(
        company_name=company_name,
        career_url=career_url,
        max_slug_guesses=payload.max_slug_guesses,
        verify_workers=payload.verify_workers,
        verify_timeout_s=payload.verify_timeout_s,
        page_timeout_s=payload.page_timeout_s,
        # NEW:
        seed_sources=seed_sources,
        discovery_mode=payload.discovery_mode,
    )
    result["company_id"] = company_id
    return result


@router.post("/companies/{company_id}/apply_discovery")
def api_apply_discovery(company_id: str, payload: ApplyDiscoveryRequest, request: Request):
    """Merge discovered sources into the company record.

    Client should send back the sources it wants to apply (typically the
    `recommended` array from /discover).
    """
    con = request.app.state.db
    c = get_company(con, company_id, DEFAULT_USER_ID)
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")

    if not payload.sources:
        raise HTTPException(status_code=400, detail="sources is required")

    add_sources = [s.model_dump() for s in payload.sources]
    merged = merge_sources(c.get("sources") or [], add_sources)

    updated = update_company(
        con,
        company_id,
        DEFAULT_USER_ID,
        {
            "company_name": c.get("company_name"),
            "employer_name": c.get("employer_name"),
            "sources": merged,
            "source_priority": c.get("source_priority") or ["career_url", "greenhouse", "lever"],
            "fetch_mode": c.get("fetch_mode") or "all",
        },
    )
    return updated


@router.get("/companies")
def api_list_companies(request: Request):
    con = request.app.state.db
    return list_companies(con, DEFAULT_USER_ID)


@router.get("/companies/{company_id}")
def api_get_company(company_id: str, request: Request):
    con = request.app.state.db
    c = get_company(con, company_id, DEFAULT_USER_ID)
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    return c


@router.post("/companies")
def api_create_company(payload: CompanyModel, request: Request):
    con = request.app.state.db
    return create_company(con, DEFAULT_USER_ID, payload.model_dump())


@router.put("/companies/{company_id}")
def api_update_company(company_id: str, payload: CompanyModel, request: Request):
    con = request.app.state.db
    try:
        return update_company(con, company_id, DEFAULT_USER_ID, payload.model_dump())
    except KeyError:
        raise HTTPException(status_code=404, detail="Company not found")


@router.delete("/companies/{company_id}")
def api_delete_company(company_id: str, request: Request):
    con = request.app.state.db
    delete_company(con, company_id, DEFAULT_USER_ID)
    return {"ok": True}
