"""
Source discovery and verification (bounded, production-safe).

This module solves the *discovery* problem:
  - Given a company name and optional career URL, suggest the best sources
    (Greenhouse / Lever / career_url) and verify them quickly.

It is intentionally conservative:
  - Bounded candidate generation
  - Strict timeouts
  - No web search integration (that can be added as a separate, opt-in tier)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse

import requests
from concurrent.futures import ThreadPoolExecutor, as_completed


_UA = "JobWatcher/0.2 (+https://localhost)"
# Slugs that appear in Greenhouse URLs but are NOT real board slugs
_RESERVED_GH_SLUGS = {"embed", "jobs", "job", "departments", "department", "board", "boards"}


# -------------------------
# Models
# -------------------------


@dataclass
class Candidate:
    type: str  # 'greenhouse' | 'lever' | 'career_url'
    slug: Optional[str] = None
    url: Optional[str] = None
    mode: Optional[str] = None  # for career_url: 'requests' | 'playwright'
    confidence: float = 0.0
    evidence: List[str] = None
    verified: bool = False
    job_count: Optional[int] = None
    error: str = ""

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["evidence"] = d.get("evidence") or []
        return d


# -------------------------
# Helpers
# -------------------------


_WS = re.compile(r"\s+")
_NON_SLUG = re.compile(r"[^a-z0-9]+")


def _norm_name(name: str) -> str:
    return _WS.sub(" ", (name or "").strip()).lower()


def guess_slugs(company_name: str, max_candidates: int = 12) -> List[str]:
    """Generate common GH/Lever slug candidates from a company name."""
    base = _norm_name(company_name)
    if not base:
        return []

    # Remove corporate suffixes that often aren't in slugs.
    base = re.sub(
        r"\b(inc|inc\.|llc|ltd|ltd\.|corp|corporation|co|company|technologies|technology)\b",
        "",
        base,
    )
    base = _WS.sub(" ", base).strip()

    squeezed = base.replace(" ", "")
    dashed = base.replace(" ", "-")
    underscored = base.replace(" ", "_")
    cleaned = _NON_SLUG.sub("-", base).strip("-")
    cleaned_squeezed = _NON_SLUG.sub("", base)

    variants = [
        cleaned,
        cleaned_squeezed,
        squeezed,
        dashed,
        underscored,
        f"{cleaned}-careers",
        f"{cleaned}careers",
        f"{cleaned}-jobs",
        f"{cleaned}jobs",
    ]

    # Extra variants: drop short stopwords
    stop = {"the", "and", "of", "for"}
    parts = [p for p in re.split(r"\s+", base) if p and p not in stop]
    if len(parts) >= 2:
        variants.extend(
            [
                "".join(parts),
                "-".join(parts),
            ]
        )

    # Deduplicate while preserving order
    out: List[str] = []
    seen = set()
    for v in variants:
        v = (v or "").strip().lower()
        v = re.sub(r"-+", "-", v).strip("-")
        if not v or v in seen:
            continue
        seen.add(v)
        out.append(v)
        if len(out) >= max_candidates:
            break
    return out

# -------------------------
# ATS detection from career URL
# -------------------------


_RE_GH = re.compile(r"boards\.greenhouse\.io/([a-z0-9-]+)", re.I)
_RE_GH_API = re.compile(r"boards-api\.greenhouse\.io/(?:v1/)?boards/([a-z0-9-]+)", re.I)
_RE_LEVER = re.compile(r"api\.lever\.co/v0/postings/([a-z0-9-]+)", re.I)
_RE_LEVER_HOSTED = re.compile(r"jobs\.lever\.co/([a-z0-9-]+)", re.I)


def _safe_get(url: str, timeout_s: float = 8.0) -> Tuple[int, str, str]:
    """Return (status_code, final_url, text) with strict timeout."""
    headers = {"User-Agent": _UA, "Accept": "text/html,application/json"}
    r = requests.get(url, headers=headers, timeout=timeout_s, allow_redirects=True)
    return r.status_code, str(r.url), r.text or ""


def detect_ats_from_career_url(career_url: str, timeout_s: float = 8.0) -> List[Candidate]:
    """Try to infer GH/Lever slugs by inspecting the career page HTML.

    This is a *lightweight* single-request approach (no crawling).
    """
    if not career_url:
        return []

    candidates: List[Candidate] = []
    try:
        status, final_url, html = _safe_get(career_url, timeout_s=timeout_s)
    except Exception as e:
        return [
            Candidate(
                type="career_url",
                url=career_url,
                mode="requests",
                confidence=0.3,
                evidence=["career_url"],
                verified=False,
                error=str(e),
            )
        ]

    evidence_base = [f"career_url:{career_url}"]
    if final_url and final_url != career_url:
        evidence_base.append(f"final_url:{final_url}")

    # Detect based on final hostname too (cheap win)
    try:
        host = urlparse(final_url or career_url).netloc.lower()
    except Exception:
        host = ""

    # Greenhouse hosted board
    if "boards.greenhouse.io" in host:
        m = _RE_GH.search(final_url)
        if m:
            slug = m.group(1).lower()
            candidates.append(
                Candidate(
                    type="greenhouse",
                    slug=slug,
                    confidence=0.95,
                    evidence=evidence_base + ["host:boards.greenhouse.io"],
                )
            )

    # Lever hosted board
    if "jobs.lever.co" in host:
        m = _RE_LEVER_HOSTED.search(final_url)
        if m:
            slug = m.group(1).lower()
            candidates.append(
                Candidate(type="lever", slug=slug, confidence=0.95, evidence=evidence_base + ["host:jobs.lever.co"])
            )

    # Look for embedded references in HTML
    html_l = (html or "").lower()
    for rex, typ, label in [
        (_RE_GH_API, "greenhouse", "html:gh_api"),
        (_RE_GH, "greenhouse", "html:gh_hosted"),
        (_RE_LEVER, "lever", "html:lever_api"),
        (_RE_LEVER_HOSTED, "lever", "html:lever_hosted"),
    ]:
        for m in rex.finditer(html_l):
            slug = m.group(1).lower()
            candidates.append(Candidate(type=typ, slug=slug, confidence=0.8, evidence=evidence_base + [label]))

    # Always include the career_url itself as a candidate source.
    career_conf = 0.7 if status and 200 <= status < 400 else 0.4
    candidates.append(
        Candidate(type="career_url", url=career_url, mode="requests", confidence=career_conf, evidence=evidence_base + [f"http:{status}"])
    )

    # De-dupe candidates by (type, slug/url)
    out: List[Candidate] = []
    seen = set()
    for c in candidates:
        key = (c.type, c.slug or "", c.url or "", c.mode or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


# -------------------------
# Verification
# -------------------------


def _verify_greenhouse(slug: str, timeout_s: float = 6.0) -> Tuple[bool, Optional[int], str]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
    headers = {"User-Agent": _UA, "Accept": "application/json"}
    try:
        r = requests.get(url, headers=headers, timeout=timeout_s)
        if r.status_code != 200:
            return False, None, f"HTTP {r.status_code}"
        data = r.json()
        jobs = data.get("jobs") if isinstance(data, dict) else None
        if not isinstance(jobs, list):
            return False, None, "Unexpected response"
        return True, len(jobs), ""
    except Exception as e:
        return False, None, str(e)


def _verify_lever(slug: str, timeout_s: float = 6.0) -> Tuple[bool, Optional[int], str]:
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    headers = {"User-Agent": _UA, "Accept": "application/json"}
    try:
        r = requests.get(url, headers=headers, timeout=timeout_s)
        if r.status_code != 200:
            return False, None, f"HTTP {r.status_code}"
        data = r.json()
        if not isinstance(data, list):
            return False, None, "Unexpected response"
        return True, len(data), ""
    except Exception as e:
        return False, None, str(e)


def verify_candidates(
    candidates: Iterable[Candidate],
    max_workers: int = 8,
    timeout_s: float = 6.0,
    max_checks_per_type: int = 12,
) -> List[Candidate]:
    """Verify GH/Lever candidates quickly.

    We cap checks per type to remain deterministic even if upstream provides huge lists.
    """
    gh: List[Candidate] = []
    lv: List[Candidate] = []
    others: List[Candidate] = []

    for c in candidates:
        if c.type == "greenhouse" and c.slug:
            gh.append(c)
        elif c.type == "lever" and c.slug:
            lv.append(c)
        else:
            others.append(c)

    gh = gh[:max_checks_per_type]
    lv = lv[:max_checks_per_type]

    def task(c: Candidate):
        if c.type == "greenhouse":
            ok, count, err = _verify_greenhouse(c.slug, timeout_s=timeout_s)
        else:
            ok, count, err = _verify_lever(c.slug, timeout_s=timeout_s)
        return c, ok, count, err

    verified: List[Candidate] = []
    to_check = gh + lv
    if to_check:
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            futs = [ex.submit(task, c) for c in to_check]
            for fut in as_completed(futs):
                c, ok, count, err = fut.result()
                c.verified = bool(ok)
                c.job_count = count
                c.error = err or ""
                if c.verified:
                    c.confidence = max(c.confidence, 0.9)
                verified.append(c)

    all_out = verified + others
    all_out.sort(
        key=lambda x: (
            0 if x.verified else 1,
            -(x.confidence or 0.0),
            -(x.job_count or 0),
            x.type,
            (x.slug or x.url or ""),
        )
    )
    return all_out


# -------------------------
# Public API
# -------------------------


def discover_sources(
    company_name: str,
    career_url: Optional[str] = None,
    max_slug_guesses: int = 10,
    verify_workers: int = 8,
    verify_timeout_s: float = 6.0,
    page_timeout_s: float = 8.0,
    # NEW:
    seed_sources: Optional[List[Dict[str, Any]]] = None,
    discovery_mode: str = "validate_existing",  # "validate_existing" | "expand"
) -> Dict[str, Any]:
    """
    Discovery now works in 2 passes:

    Pass 1 (always):
      - Validate existing company slugs (seed_sources)
      - Detect ATS slugs from career_url

    Pass 2 (only if needed):
      - Guess slugs from company_name

    Behavior:
      - discovery_mode="validate_existing" (default):
          If any seeded/detected GH/Lever slug verifies, we DO NOT run guessing.
      - discovery_mode="expand":
          Always run guessing too (to find alternates).
    """

    seed_sources = seed_sources or []
    discovery_mode = (discovery_mode or "validate_existing").strip().lower()

    # -------------------------
    # Pass 1: seed + career_url
    # -------------------------
    candidates: List[Candidate] = []

    # 1) Seed existing GH/Lever slugs (highest priority)
    #    This fixes: "I already provided slug but discover ignores it"
    for s in seed_sources:
        t = (s.get("type") or "").strip().lower()
        slug = (s.get("slug") or "").strip().lower()
        if t not in ("greenhouse", "lever") or not slug:
            continue
        if t == "greenhouse" and slug in _RESERVED_GH_SLUGS:
            continue
        candidates.append(Candidate(type=t, slug=slug, confidence=0.99, evidence=["seed"]))

    # 2) Detect ATS from career_url (single fetch, high signal)
    if career_url:
        detected = detect_ats_from_career_url(career_url, timeout_s=page_timeout_s)
        # Filter out bogus GH "embed" slug if it ever appears
        filtered: List[Candidate] = []
        for c in detected:
            if c.type == "greenhouse" and c.slug and c.slug.lower() in _RESERVED_GH_SLUGS:
                continue
            filtered.append(c)
        candidates.extend(filtered)

    # De-dupe before verify
    deduped_pass1: List[Candidate] = []
    seen = set()
    for c in candidates:
        key = (c.type, c.slug or "", c.url or "", c.mode or "")
        if key in seen:
            continue
        seen.add(key)
        deduped_pass1.append(c)

    verified_pass1 = verify_candidates(
        deduped_pass1,
        max_workers=verify_workers,
        timeout_s=verify_timeout_s,
        max_checks_per_type=14,
    )

    any_verified_primary = any(
        c.type in ("greenhouse", "lever") and c.verified for c in verified_pass1
    )

    # Decide whether to run guessing
    should_guess = False
    if discovery_mode == "expand":
        should_guess = True
    elif discovery_mode == "validate_existing":
        # Guess only if we have no verified GH/Lever
        should_guess = not any_verified_primary
    else:
        # Unknown mode -> safe default
        should_guess = not any_verified_primary

    # -------------------------
    # Pass 2: guessing (optional)
    # -------------------------
    final_candidates = verified_pass1

    if should_guess:
        expanded: List[Candidate] = list(deduped_pass1)

        for slug in guess_slugs(company_name, max_candidates=max_slug_guesses):
            slug = (slug or "").strip().lower()
            if not slug:
                continue
            if slug in _RESERVED_GH_SLUGS:
                continue
            expanded.append(Candidate(type="greenhouse", slug=slug, confidence=0.55, evidence=["guess"]))
            expanded.append(Candidate(type="lever", slug=slug, confidence=0.55, evidence=["guess"]))

        # de-dupe expanded list
        deduped_expanded: List[Candidate] = []
        seen2 = set()
        for c in expanded:
            key = (c.type, c.slug or "", c.url or "", c.mode or "")
            if key in seen2:
                continue
            seen2.add(key)
            deduped_expanded.append(c)

        final_candidates = verify_candidates(
            deduped_expanded,
            max_workers=verify_workers,
            timeout_s=verify_timeout_s,
            max_checks_per_type=14,
        )

    # Recommended: verified GH/Lever + career_url (as fallback)
    recommended: List[Candidate] = []
    for c in final_candidates:
        if c.type in ("greenhouse", "lever") and c.verified:
            recommended.append(c)

    # Add career_url if present
    for c in final_candidates:
        if c.type == "career_url" and c.url:
            recommended.append(c)
            break

    return {
        "company_name": company_name,
        "career_url": career_url,
        "discovery_mode": discovery_mode,
        "seed_sources": seed_sources,
        "pass1_verified_any": any_verified_primary,
        "guessed": bool(should_guess),
        "candidates": [c.to_dict() for c in final_candidates],
        "recommended": [c.to_dict() for c in recommended],
    }


def merge_sources(existing: List[Dict[str, Any]], add: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge sources into a stable, de-duped list."""
    existing = existing or []
    add = add or []
    out: List[Dict[str, Any]] = []
    seen = set()

    def k(s: Dict[str, Any]) -> Tuple[str, str]:
        t = (s.get("type") or "").strip()
        if t in ("greenhouse", "lever"):
            return t, (s.get("slug") or "").strip().lower()
        return t, (s.get("url") or "").strip()

    for src in existing + add:
        key = k(src)
        if not key[0] or not key[1]:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(src)
    return out
