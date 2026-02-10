#!/usr/bin/env python3
"""
Legacy fetcher used by backend adapter. Supports:
- Greenhouse public board API
- Lever public postings API
- Career URL (HTML scraping best-effort + optional Playwright render)

Behavior:
- Greenhouse jobs are auto-enriched via job detail endpoint when list results miss location/content
- errors keyed as "<label>:<type>" so one source doesn't overwrite another
- NO captcha bypass, NO stealth

Env flags:
- CAREERURL_PLAYWRIGHT=1   -> allow Playwright rendering for career_url sources with mode="playwright"

Career URL tuning env vars:
- CAREERURL_MAX_PAGES=15
- CAREERURL_TIME_BUDGET_S=25
- CAREERURL_LIST_TIMEOUT_S=25
- CAREERURL_DETAIL_TIMEOUT_S=20
- CAREERURL_MAX_CANDIDATES=60
- CAREERURL_MAX_FETCH=40
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import sys
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse, urlunparse, parse_qs, urlencode

try:
    import requests
except ImportError:
    print("Missing dependency: requests. Install with: pip install requests")
    sys.exit(1)

try:
    from bs4 import BeautifulSoup  # type: ignore
except ImportError:
    BeautifulSoup = None  # type: ignore


# =========================
# Default restriction phrases (hard NO signals)
# =========================
DEFAULT_VISA_RESTRICTION_PHRASES: List[str] = [
    "no visa sponsorship",
    "visa sponsorship is not available",
    "sponsorship not available",
    "not eligible for visa sponsorship",
    "will not sponsor",
    "we do not sponsor",
    "no sponsorship",
    "no future sponsorship",
    "without visa sponsorship",
    "cannot sponsor",
    "unable to sponsor",
    "do not provide sponsorship",
    "must be authorized to work in the united states without sponsorship",
    "must be authorized to work in the u.s. without sponsorship",
    "authorized to work in the us without sponsorship",
    "authorized to work in the u.s. without sponsorship",
    "work authorization without sponsorship",
    "no c2c",
    "no corp to corp",
    "no corp-to-corp",
    "us citizens only",
    "u.s. citizens only",
    "u.s. citizen only",
    "us citizen required",
    "u.s. citizen required",
    "must be a u.s. citizen",
    "must be a us citizen",
    "citizenship required",
    "security clearance",
    "clearance required",
    "must be able to obtain a security clearance",
    "must be eligible for a security clearance",
]

USER_AGENT = "job-watcher-legacy/1.4 (+greenhouse+lever+career_url; no-stealth)"
STATE_RE = re.compile(r"(?:,\s*|\s+)([A-Z]{2})(?:\b|$)")
US_HINT_RE = re.compile(r"\b(united states|u\.s\.a\.|usa|u\.s\.|us)\b", re.IGNORECASE)

# ATS host patterns used by career_url auto-discovery.
# Note: keep these intentionally simple and conservative; this is *not* a crawler.
_RE_GH_HOSTED_ANY = re.compile(r"(?:boards|job-boards)\.greenhouse\.io/([a-z0-9-]+)", re.I)
_RE_GH_API = re.compile(r"boards-api\.greenhouse\.io/(?:v1/)?boards/([a-z0-9-]+)", re.I)
_RE_LEVER_API = re.compile(r"api\.lever\.co/v0/postings/([a-z0-9-]+)", re.I)
_RE_LEVER_HOSTED = re.compile(r"jobs\.lever\.co/([a-z0-9-]+)", re.I)

# Some Greenhouse paths are not slugs (e.g. /embed). Guard against false positives.
_GH_RESERVED_SLUGS = {
    "embed",
    "jobs",
    "job",
    "departments",
    "department",
    "positions",
    "position",
    "postings",
    "posting",
    "search",
}


def _is_valid_gh_slug(slug: str) -> bool:
    s = (slug or "").strip().lower()
    if not s:
        return False
    if s in _GH_RESERVED_SLUGS:
        return False
    # Slugs are usually short-ish; prevent absurd captures.
    if len(s) > 64:
        return False
    return bool(re.fullmatch(r"[a-z0-9-]+", s))

# Oracle Recruiting Cloud / CandidateExperience job URLs (common across many companies)
ORACLE_JOB_URL_RE = re.compile(r"/en/sites/jobsearch/job/\d+/?", re.IGNORECASE)
ORACLE_JOB_URL_RE2 = re.compile(r"/jobsearch/job/\d+/?", re.IGNORECASE)
# Some ORC deployments use requisitions
ORACLE_REQ_URL_RE = re.compile(r"/requisitions/\d+/?", re.IGNORECASE)


# --- Full US state name -> code mapping ---
STATE_NAME_TO_CODE = {
    "ALABAMA": "AL",
    "ALASKA": "AK",
    "ARIZONA": "AZ",
    "ARKANSAS": "AR",
    "CALIFORNIA": "CA",
    "COLORADO": "CO",
    "CONNECTICUT": "CT",
    "DELAWARE": "DE",
    "FLORIDA": "FL",
    "GEORGIA": "GA",
    "HAWAII": "HI",
    "IDAHO": "ID",
    "ILLINOIS": "IL",
    "INDIANA": "IN",
    "IOWA": "IA",
    "KANSAS": "KS",
    "KENTUCKY": "KY",
    "LOUISIANA": "LA",
    "MAINE": "ME",
    "MARYLAND": "MD",
    "MASSACHUSETTS": "MA",
    "MICHIGAN": "MI",
    "MINNESOTA": "MN",
    "MISSISSIPPI": "MS",
    "MISSOURI": "MO",
    "MONTANA": "MT",
    "NEBRASKA": "NE",
    "NEVADA": "NV",
    "NEW HAMPSHIRE": "NH",
    "NEW JERSEY": "NJ",
    "NEW MEXICO": "NM",
    "NEW YORK": "NY",
    "NORTH CAROLINA": "NC",
    "NORTH DAKOTA": "ND",
    "OHIO": "OH",
    "OKLAHOMA": "OK",
    "OREGON": "OR",
    "PENNSYLVANIA": "PA",
    "RHODE ISLAND": "RI",
    "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD",
    "TENNESSEE": "TN",
    "TEXAS": "TX",
    "UTAH": "UT",
    "VERMONT": "VT",
    "VIRGINIA": "VA",
    "WASHINGTON": "WA",
    "WEST VIRGINIA": "WV",
    "WISCONSIN": "WI",
    "WYOMING": "WY",
    "DISTRICT OF COLUMBIA": "DC",
}

# City -> state heuristic fallback
CITY_TO_STATE = {
    "SEATTLE": "WA",
    "BELLEVUE": "WA",
    "REDMOND": "WA",
    "SAN FRANCISCO": "CA",
    "SOUTH SAN FRANCISCO": "CA",
    "MOUNTAIN VIEW": "CA",
    "SUNNYVALE": "CA",
    "PALO ALTO": "CA",
    "SAN JOSE": "CA",
    "LOS ANGELES": "CA",
    "SANTA MONICA": "CA",
    "SAN DIEGO": "CA",
    "IRVINE": "CA",
    "SACRAMENTO": "CA",
    "PORTLAND": "OR",
    "BOULDER": "CO",
    "DENVER": "CO",
    "AUSTIN": "TX",
    "DALLAS": "TX",
    "HOUSTON": "TX",
    "SAN ANTONIO": "TX",
    "CHICAGO": "IL",
    "MINNEAPOLIS": "MN",
    "NEW YORK": "NY",
    "BROOKLYN": "NY",
    "JERSEY CITY": "NJ",
    "BOSTON": "MA",
    "CAMBRIDGE": "MA",
    "WASHINGTON": "DC",
    "ARLINGTON": "VA",
    "ALEXANDRIA": "VA",
    "ATLANTA": "GA",
    "MIAMI": "FL",
    "PHILADELPHIA": "PA",
    "RALEIGH": "NC",
    "CHARLOTTE": "NC",
}


# =========================
# Utilities
# =========================
def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_lower(s: Optional[str]) -> str:
    return (s or "").lower()


def contains_any(haystack: str, needles: List[str]) -> bool:
    h = (haystack or "").lower()
    for n in needles:
        n = (n or "").strip().lower()
        if n and n in h:
            return True
    return False


def sha1_text(s: str) -> str:
    return hashlib.sha1((s or "").encode("utf-8", errors="ignore")).hexdigest()


def normalize_whitespace(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def extract_us_state_code(location_text: str) -> Optional[str]:
    if not location_text:
        return None

    parts = re.split(r"\bor\b|/|\||;|•", location_text.strip(), flags=re.IGNORECASE)
    parts = [p.strip() for p in parts if p and p.strip()]

    for part in parts:
        m = STATE_RE.search(part)
        if m:
            return m.group(1).upper()

        upper = part.upper()
        for name, code in STATE_NAME_TO_CODE.items():
            if name in upper:
                return code

        cleaned = re.sub(r"[^A-Z\s]", " ", part.upper())
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        for city in sorted(CITY_TO_STATE.keys(), key=len, reverse=True):
            if city in cleaned:
                return CITY_TO_STATE[city]

    return None


def classify_work_mode(text: str) -> str:
    t = safe_lower(text)
    if "hybrid" in t:
        return "hybrid"
    if "remote" in t:
        return "remote"
    if "on-site" in t or "onsite" in t or "on site" in t:
        return "onsite"
    return "unknown"


def is_remote_us(location_text: str) -> bool:
    lt = safe_lower(location_text)
    if "remote" not in lt:
        return False
    if US_HINT_RE.search(location_text or ""):
        return True
    if re.search(r"\bremote\b.*\b(us|u\.s\.|united states)\b", location_text, re.IGNORECASE):
        return True
    return False


def is_us_location(location_text: str) -> bool:
    if not location_text:
        return False
    return is_remote_us(location_text) or (extract_us_state_code(location_text) is not None) or bool(
        US_HINT_RE.search(location_text)
    )


def _http_get(url: str, params: Optional[Dict[str, Any]] = None, timeout: int = 30) -> requests.Response:
    headers = {"User-Agent": USER_AGENT}
    last_exc: Optional[Exception] = None
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=timeout)
            r.raise_for_status()
            return r
        except Exception as e:
            last_exc = e
            time.sleep(0.6 * (2**attempt) + (0.05 * attempt))
    raise last_exc  # type: ignore


# =========================
# USCIS H1B Support (download + cache)
# =========================
LEGAL_SUFFIXES_RE = re.compile(
    r"\b(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|company|pllc)\b",
    re.IGNORECASE,
)
NON_ALNUM_RE = re.compile(r"[^A-Z0-9]+")


def canonicalize_employer_name(name: str) -> str:
    s = (name or "").strip().upper()
    s = LEGAL_SUFFIXES_RE.sub(" ", s)
    s = NON_ALNUM_RE.sub("", s)
    return s


class H1BSupportAgent:
    def __init__(self, years: List[int], cache_dir: str):
        self.years = [int(y) for y in (years or [])]
        self.cache_dir = cache_dir or "./.cache/uscis_h1b"
        self.employers_canon: set[str] = set()
        self.loaded = False
        self.load_errors: List[str] = []
        os.makedirs(self.cache_dir, exist_ok=True)
        self._load_all()

    def _url_for_year(self, year: int) -> str:
        return f"https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-{year}.csv"

    def _cache_path_for_year(self, year: int) -> str:
        return os.path.join(self.cache_dir, f"h1b_datahubexport-{year}.csv")

    def _download_if_missing(self, year: int) -> Optional[str]:
        path = self._cache_path_for_year(year)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return path
        try:
            r = _http_get(self._url_for_year(year), timeout=60)
            tmp = path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(r.content)
            os.replace(tmp, path)
            return path
        except Exception as e:
            self.load_errors.append(f"USCIS download failed for {year}: {e}")
            return None

    def _detect_employer_column(self, fieldnames: List[str]) -> Optional[str]:
        for fn in fieldnames:
            if (fn or "").strip().lower() == "employer":
                return fn
        for fn in fieldnames:
            if "employer" in (fn or "").strip().lower():
                return fn
        return None

    def _load_csv_employers(self, csv_path: str) -> None:
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                self.load_errors.append(f"USCIS read failed (no headers): {csv_path}")
                return
            col = self._detect_employer_column(reader.fieldnames)
            if not col:
                self.load_errors.append(f"USCIS read failed (no employer col): {csv_path}")
                return
            for row in reader:
                name = (row.get(col) or "").strip()
                if name:
                    self.employers_canon.add(canonicalize_employer_name(name))

    def _load_all(self) -> None:
        for year in self.years:
            p = self._download_if_missing(year)
            if p:
                try:
                    self._load_csv_employers(p)
                except Exception as e:
                    self.load_errors.append(f"USCIS read failed for {p}: {e}")
        self.loaded = len(self.employers_canon) > 0

    def has_past_h1b_support(self, employer_name: str) -> bool:
        if not self.loaded:
            return False
        canon = canonicalize_employer_name(employer_name)
        return bool(canon) and (canon in self.employers_canon)


# =========================
# Data Model
# =========================
@dataclass
class NormalizedJob:
    source_type: str
    company_label: str
    company_slug: str
    employer_name: str
    job_id: str
    title: str
    location: str
    description: str
    url: str

    department: str = ""
    team: str = ""
    work_mode: str = "unknown"

    # If a career_url wrapper auto-discovered an ATS (GH/Lever), we keep the originating
    # career_url here so the backend can persist the discovered ATS slug and stop using
    # career_url for that company going forward.
    detected_from_url: str = ""

    past_h1b_support: str = "no"
    first_seen: str = ""
    dedupe_key: str = ""


# =========================
# Source Agents
# =========================
class SourceAgent:
    def fetch(self, company_slug: str, label: str, src: Dict[str, Any]) -> List[Dict[str, Any]]:
        raise NotImplementedError


class GreenhouseAgent(SourceAgent):
    def fetch(self, company_slug: str, label: str, src: Dict[str, Any]) -> List[Dict[str, Any]]:
        list_url = f"https://boards-api.greenhouse.io/v1/boards/{company_slug}/jobs"
        r = _http_get(list_url, params={"content": "true"}, timeout=30)
        jobs = (r.json() or {}).get("jobs", []) or []
        if not isinstance(jobs, list):
            return []

        enriched: List[Dict[str, Any]] = []
        for j in jobs:
            try:
                job_id = str(j.get("id") or "").strip()

                loc_name = ""
                loc_obj = j.get("location")
                if isinstance(loc_obj, dict):
                    loc_name = (loc_obj.get("name") or "").strip()
                elif isinstance(loc_obj, str):
                    loc_name = loc_obj.strip()

                content = (j.get("content") or "").strip()
                needs_detail = (not loc_name) or (not content)

                if needs_detail and job_id:
                    detail_url = f"https://boards-api.greenhouse.io/v1/boards/{company_slug}/jobs/{job_id}"
                    d = _http_get(detail_url, params={"content": "true"}, timeout=30).json() or {}
                    merged = dict(j)
                    merged.update(d)
                    enriched.append(merged)
                else:
                    enriched.append(j)
            except Exception:
                enriched.append(j)

        return enriched


class LeverAgent(SourceAgent):
    def fetch(self, company_slug: str, label: str, src: Dict[str, Any]) -> List[Dict[str, Any]]:
        url = f"https://api.lever.co/v0/postings/{company_slug}"
        r = _http_get(url, params={"mode": "json"}, timeout=30)
        data = r.json()
        return data if isinstance(data, list) else []


class CareerUrlAgent(SourceAgent):
    """
    Pagination-aware career page fetcher.

    Key goals:
      - Handle list pages where page1 may not contain your keywords (Stripe is exactly like this)
      - Keep runtime bounded (time budget + caps)
      - Prefer extracting jobs directly from listing pages (fast)
      - Support Oracle Recruiting Cloud tiles (jobsearch/job/<id>)
    """

    def fetch(self, company_slug: str, label: str, src: Dict[str, Any]) -> List[Dict[str, Any]]:
        url = (src.get("url") or "").strip()
        mode = (src.get("mode") or "requests").strip().lower()
        print(f"[career_url][{label}] mode={mode} url={url}")

        if not url:
            return []

        MAX_PAGES = int(os.getenv("CAREERURL_MAX_PAGES", "15"))
        TIME_BUDGET_S = int(os.getenv("CAREERURL_TIME_BUDGET_S", "25"))
        LIST_TIMEOUT = int(os.getenv("CAREERURL_LIST_TIMEOUT_S", "25"))

        pages = self._iterate_list_pages(
            url,
            mode=mode,
            max_pages=MAX_PAGES,
            timeout=LIST_TIMEOUT,
            time_budget_s=TIME_BUDGET_S,
        )
        if not pages:
            return []

        listing_jobs: List[Dict[str, Any]] = []
        for (html, final_url) in pages:
            listing_jobs.extend(self._extract_jobs_from_listing_html(html, final_url))

        listing_jobs = self._dedupe_jobs_by_url(listing_jobs)
        if listing_jobs:
            print(f"[career_url][{label}] extracted_from_list_pages jobs={len(listing_jobs)} pages={len(pages)}")
            return listing_jobs

        jobs: List[Dict[str, Any]] = []
        for (html, final_url) in pages:
            jobs.extend(self._extract_from_jsonld(html, final_url))
            jobs.extend(self._extract_from_embedded_json(html, final_url))

        jobs = self._keep_high_signal_jobs(jobs)
        jobs = self._dedupe_jobs_by_url(jobs)
        if jobs:
            print(f"[career_url][{label}] extracted_from_json_high_signal jobs={len(jobs)} pages={len(pages)}")
            return jobs

        html0, url0 = pages[0]

        # --- ATS auto-discovery ---
        # Many companies host a thin wrapper "open roles" page (marketing site) that links to or embeds
        # a real ATS board (e.g., Greenhouse, Lever). In those cases, scraping wrapper HTML is brittle
        # (or returns nothing if jobs are injected by JS). If we can detect a well-known ATS slug,
        # switch to the ATS API immediately for higher reliability.
        detected = self._detect_embedded_ats(html0, url0)
        if detected:
            for d in detected:
                d_type = d.get("type")
                d_slug = d.get("slug")
                if not d_type or not d_slug:
                    continue
                try:
                    if d_type == "greenhouse":
                        print(f"[career_url][{label}] ats_autodiscovery type=greenhouse slug={d_slug}")
                        gh_jobs = GreenhouseAgent().fetch(d_slug, label, {"type": "greenhouse"})
                        for j in gh_jobs:
                            j["_detected_source_type"] = "greenhouse"
                            j["_detected_company_slug"] = d_slug
                            j["_detected_from_url"] = url0
                        if gh_jobs:
                            return gh_jobs

                    if d_type == "lever":
                        print(f"[career_url][{label}] ats_autodiscovery type=lever slug={d_slug}")
                        lv_jobs = LeverAgent().fetch(d_slug, label, {"type": "lever"})
                        for j in lv_jobs:
                            j["_detected_source_type"] = "lever"
                            j["_detected_company_slug"] = d_slug
                            j["_detected_from_url"] = url0
                        if lv_jobs:
                            return lv_jobs
                except Exception as e:
                    print(f"[career_url][{label}] ats_autodiscovery failed type={d_type} slug={d_slug} err={e}")

        # --- Auto-escalate to Playwright once when requests yields 0 ---
        # This avoids per-company manual mode switches for JS-heavy sites (e.g., Oracle).
        # Still bounded by the same TIME_BUDGET_S and paging caps.
        if mode == "requests" and os.getenv("CAREERURL_AUTO_PLAYWRIGHT", "1") == "1":
            if os.getenv("CAREERURL_PLAYWRIGHT", "0") == "1":
                try:
                    print(f"[career_url][{label}] retry_with_playwright reason=no_jobs_extracted")
                    html_pw, url_pw = self._render_with_playwright(url0)
                    if html_pw:
                        # Re-run fast extractors on rendered DOM
                        listing_jobs_pw = self._dedupe_jobs_by_url(self._extract_jobs_from_listing_html(html_pw, url_pw))
                        if listing_jobs_pw:
                            print(f"[career_url][{label}] extracted_from_playwright_list jobs={len(listing_jobs_pw)}")
                            return listing_jobs_pw

                        jobs_pw: List[Dict[str, Any]] = []
                        jobs_pw.extend(self._extract_from_jsonld(html_pw, url_pw))
                        jobs_pw.extend(self._extract_from_embedded_json(html_pw, url_pw))
                        jobs_pw = self._keep_high_signal_jobs(jobs_pw)
                        jobs_pw = self._dedupe_jobs_by_url(jobs_pw)
                        if jobs_pw:
                            print(f"[career_url][{label}] extracted_from_playwright_json jobs={len(jobs_pw)}")
                            return jobs_pw

                        detected_pw = self._detect_embedded_ats(html_pw, url_pw)
                        if detected_pw:
                            for d in detected_pw:
                                d_type = d.get("type")
                                d_slug = d.get("slug")
                                if not d_type or not d_slug:
                                    continue
                                if d_type == "greenhouse":
                                    print(f"[career_url][{label}] ats_autodiscovery(playwright) type=greenhouse slug={d_slug}")
                                    try:
                                        gh_jobs = GreenhouseAgent().fetch(d_slug, label, {"type": "greenhouse"})
                                        for j in gh_jobs:
                                            j["_detected_source_type"] = "greenhouse"
                                            j["_detected_company_slug"] = d_slug
                                            j["_detected_from_url"] = url0
                                        if gh_jobs:
                                            return gh_jobs
                                    except Exception as e:
                                        print(f"[career_url][{label}] ats_autodiscovery(playwright) failed type=greenhouse slug={d_slug} err={e}")
                                if d_type == "lever":
                                    print(f"[career_url][{label}] ats_autodiscovery(playwright) type=lever slug={d_slug}")
                                    try:
                                        lv_jobs = LeverAgent().fetch(d_slug, label, {"type": "lever"})
                                        for j in lv_jobs:
                                            j["_detected_source_type"] = "lever"
                                            j["_detected_company_slug"] = d_slug
                                            j["_detected_from_url"] = url0
                                        if lv_jobs:
                                            return lv_jobs
                                    except Exception as e:
                                        print(f"[career_url][{label}] ats_autodiscovery(playwright) failed type=lever slug={d_slug} err={e}")
                except Exception as e:
                    print(f"[career_url][{label}] retry_with_playwright failed err={e}")

        fallback = self._discover_and_fetch_job_links(html0, url0)
        fallback = self._dedupe_jobs_by_url(fallback)
        print(f"[career_url][{label}] fallback_detail_fetch jobs={len(fallback)} pages=1")
        return fallback

    # -------------------------
    # Pagination (kept as-is from your working version)
    # -------------------------
    def _iterate_list_pages(
        self,
        url: str,
        mode: str,
        max_pages: int,
        timeout: int,
        time_budget_s: int,
    ) -> List[Tuple[str, str]]:
        if max_pages <= 1:
            max_pages = 1

        def fetch_one(u: str) -> Tuple[str, str]:
            if mode == "playwright":
                if os.getenv("CAREERURL_PLAYWRIGHT", "0") != "1":
                    # Explicit log helps debugging
                    print(f"[career_url] playwright disabled via CAREERURL_PLAYWRIGHT!=1 (skipping render)")
                    return "", u
                return self._render_with_playwright(u)
            r = _http_get(u, timeout=timeout)
            return (r.text or ""), (r.url or u)

        start = time.time()

        out: List[Tuple[str, str]] = []
        seen: set[str] = set()
        q: deque[str] = deque()

        q.append(url)
        base_netloc = urlparse(url).netloc

        while q and len(out) < max_pages and (time.time() - start) <= time_budget_s:
            u = q.popleft()
            if not u:
                continue

            if urlparse(u).netloc and urlparse(u).netloc != base_netloc:
                continue
            if u in seen:
                continue

            try:
                html, final_url = fetch_one(u)
            except Exception:
                continue

            if not html:
                seen.add(u)
                continue

            seen.add(u)
            seen.add(final_url)
            out.append((html, final_url))

            if len(out) >= max_pages or (time.time() - start) > time_budget_s:
                break

            next_links, max_page, numeric_param = self._discover_pagination_candidates(html, final_url)

            for nu in next_links:
                if not nu:
                    continue
                if urlparse(nu).netloc != base_netloc:
                    continue
                if nu not in seen:
                    q.append(nu)

            if max_page:
                synth = self._build_page_param_urls(final_url, max_pages=max_page)
                for su in synth:
                    if su not in seen:
                        q.append(su)

            if numeric_param:
                param_name, max_value, step = numeric_param
                synth2 = self._build_numeric_param_urls(final_url, param_name, max_value, step)
                for su in synth2:
                    if su not in seen:
                        q.append(su)

        return out

    def _discover_pagination_candidates(
        self, html: str, base_url: str
    ) -> Tuple[List[str], Optional[int], Optional[Tuple[str, int, int]]]:
        if BeautifulSoup is None:
            return ([], None, None)

        soup = BeautifulSoup(html, "html.parser")
        base = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"
        base_netloc = urlparse(base_url).netloc

        urls: List[str] = []
        max_page_num: Optional[int] = None

        paging_param_candidates = ("skip", "offset", "start")
        seen_param_values: Dict[str, set[int]] = {k: set() for k in paging_param_candidates}

        for ln in soup.find_all("link", attrs={"rel": "next"}):
            href = (ln.get("href") or "").strip()
            if href:
                urls.append(urljoin(base, href))

        for a in soup.find_all("a", attrs={"rel": "next"}):
            href = (a.get("href") or "").strip()
            if href:
                urls.append(urljoin(base, href))

        for a in soup.find_all("a", attrs={"href": True}):
            href = (a.get("href") or "").strip()
            if not href:
                continue
            al = (a.get("aria-label") or "").strip().lower()
            txt = (a.get_text(" ", strip=True) or "").strip().lower()
            if "next" in al or txt == "next" or txt.endswith("next"):
                urls.append(urljoin(base, href))
            if "last" in al or txt == "last" or txt.endswith("last"):
                urls.append(urljoin(base, href))

        for a in soup.select("a[href]"):
            href = (a.get("href") or "").strip()
            if not href:
                continue
            absu = urljoin(base, href)
            if urlparse(absu).netloc != base_netloc:
                continue

            low = absu.lower()
            if "page=" in low:
                urls.append(absu)

            try:
                qs = parse_qs(urlparse(absu).query)
                for k in paging_param_candidates:
                    if k in qs and qs[k]:
                        v = str(qs[k][0]).strip()
                        if v.isdigit():
                            seen_param_values[k].add(int(v))
            except Exception:
                pass

            txt = (a.get_text(" ", strip=True) or "").strip()
            if txt.isdigit():
                try:
                    n = int(txt)
                    if n > 1:
                        max_page_num = n if max_page_num is None else max(max_page_num, n)
                except Exception:
                    pass

        urls = list(dict.fromkeys(urls))

        numeric_info: Optional[Tuple[str, int, int]] = None
        for k in paging_param_candidates:
            vals = sorted(seen_param_values.get(k) or [])
            if not vals:
                continue
            max_v = max(vals)
            step = 0
            if len(vals) >= 2:
                diffs = [b - a for a, b in zip(vals, vals[1:]) if (b - a) > 0]
                if diffs:
                    step = min(diffs)
            numeric_info = (k, max_v, step)
            break

        return (urls[:25], max_page_num, numeric_info)

    def _build_numeric_param_urls(self, base_url: str, param: str, max_value: int, step: int) -> List[str]:
        if not param or max_value <= 0:
            return []

        p = urlparse(base_url)
        qs = parse_qs(p.query)
        step = step or 100

        urls: List[str] = []
        for v in range(step, max_value + 1, step):
            qs2 = dict(qs)
            qs2[param] = [str(v)]
            new_query = urlencode(qs2, doseq=True)
            nu = urlunparse((p.scheme, p.netloc, p.path, p.params, new_query, p.fragment))
            urls.append(nu)

        return urls

    def _build_page_param_urls(self, base_url: str, max_pages: int) -> List[str]:
        p = urlparse(base_url)
        qs = parse_qs(p.query)
        if any(k.lower() == "page" for k in qs.keys()):
            return []

        urls: List[str] = []
        for page_num in range(2, max_pages + 1):
            qs2 = dict(qs)
            qs2["page"] = [str(page_num)]
            new_query = urlencode(qs2, doseq=True)
            nu = urlunparse((p.scheme, p.netloc, p.path, p.params, new_query, p.fragment))
            urls.append(nu)

        return urls

    # -------------------------
    # Fast listing extraction (UPDATED: Oracle + better location parsing)
    # -------------------------
    def _extract_jobs_from_listing_html(self, html: str, base_url: str) -> List[Dict[str, Any]]:
        if BeautifulSoup is None:
            return []

        soup = BeautifulSoup(html, "html.parser")
        base = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"

        jobs: List[Dict[str, Any]] = []

        def add_job(absu: str, title: str, location: str) -> None:
            absu = (absu or "").strip()
            if not absu:
                return
            title = normalize_whitespace(title or "")
            location = normalize_whitespace(location or "")
            job_id = sha1_text(absu)
            jobs.append(
                {
                    "id": job_id,
                    "title": title,
                    "location": {"name": location},
                    "content": "",
                    "absolute_url": absu,
                    "departments": [],
                }
            )

        # --- 1) Stripe pattern: /jobs/listing/xxxx/1234567 ---
        links = soup.select("a[href*='/jobs/listing/']")
        for a in links:
            href = (a.get("href") or "").strip()
            if not href:
                continue
            absu = urljoin(base, href)
            title = normalize_whitespace(a.get_text(" ", strip=True) or "")

            location = ""
            tr = a.find_parent("tr")
            if tr:
                tds = tr.find_all("td")
                if len(tds) >= 2:
                    location = normalize_whitespace(tds[-1].get_text(" ", strip=True) or "")

            add_job(absu, title, location)

        # --- 2) Generic "job link" patterns (covers Oracle Candidate Experience + many others) ---
        if not jobs:
            # We try to extract from tile/card containers first so we can grab title + location nearby.
            tile_selectors = [
                "li[data-qa='searchResultItem']",
                "div.job-grid-item",
                "div.job-tile",
                "div[class*='job-tile']",
                "div[class*='job-card']",
                "div[class*='search-result']",
            ]

            tiles: List[Any] = []
            for sel in tile_selectors:
                tiles.extend(soup.select(sel))
            # Deduplicate tile nodes while preserving order
            seen_ids = set()
            uniq_tiles = []
            for t in tiles:
                tid = id(t)
                if tid in seen_ids:
                    continue
                seen_ids.add(tid)
                uniq_tiles.append(t)

            # Inside each tile, look for the first anchor that looks like a job details link.
            job_href_re = re.compile(
                r"/job/\d+/?|/jobs/view/\d+|/careers/job/\d+|/positions/\d+|/job-search/\d+",
                re.IGNORECASE,
            )

            for tile in uniq_tiles[:500]:
                a = tile.find("a", href=True)
                if not a:
                    continue
                href = (a.get("href") or "").strip()
                if not href:
                    continue
                absu = urljoin(base, href)

                if not job_href_re.search(urlparse(absu).path):
                    # Also accept links that contain /job/ in the path even if not purely numeric
                    if "/job/" not in urlparse(absu).path.lower():
                        continue

                # title heuristics
                title = ""
                # common title elements
                title_el = tile.select_one(".job-tile__title") or tile.select_one("span[class*='title']") or tile.find("h2") or tile.find("h3")
                if title_el:
                    title = normalize_whitespace(title_el.get_text(" ", strip=True) or "")
                if not title:
                    title = normalize_whitespace(a.get_text(" ", strip=True) or "")

                # location heuristics (Oracle has posting-locations + aria-label tooltips)
                location = ""
                loc_el = tile.select_one("posting-locations span") or tile.select_one(".posting-locations span") or tile.select_one("[class*='locations'] span")
                if loc_el:
                    location = normalize_whitespace(loc_el.get_text(" ", strip=True) or "")

                # Oracle often has a big aria-label listing locations; take the first one as primary.
                if not location:
                    al = (tile.get("aria-label") or "") or ""
                    if "Locations" in al:
                        # Example includes "Locations,United States,Santa Clara, CA, United States,Seattle..."
                        parts = [p.strip() for p in al.split(",") if p.strip()]
                        # find first token after "Locations"
                        for i, p in enumerate(parts):
                            if p.lower() == "locations" and i + 1 < len(parts):
                                location = parts[i + 1]
                                break

                add_job(absu, title, location)

        # --- 3) Last-resort: scan all anchors for job-ish URLs (no tile context) ---
        if not jobs:
            for a in soup.select("a[href]"):
                href = (a.get("href") or "").strip()
                if not href:
                    continue
                absu = urljoin(base, href)
                u_low = absu.lower()
                pth = urlparse(absu).path.lower()

                is_jobish = (
                    "gh_jid=" in u_low
                    or ("boards.greenhouse.io" in u_low or "job-boards.greenhouse.io" in u_low)
                    or ("lever.co" in u_low and ("/apply" in u_low or "/postings/" in u_low))
                    or "/jobs/listing/" in pth
                    or re.search(r"/job/\d+/?", pth) is not None
                    or re.search(r"/(jobs|careers|positions|listing)/[^?#]*\d{4,}(\b|/|$)", u_low) is not None
                )
                if not is_jobish:
                    continue

                title = normalize_whitespace(a.get_text(" ", strip=True) or "")
                add_job(absu, title, "")

        return jobs

    def _dedupe_jobs_by_url(self, jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        out: List[Dict[str, Any]] = []
        for j in jobs:
            u = (j.get("absolute_url") or j.get("url") or "").strip()
            if not u:
                continue
            if u in seen:
                continue
            seen.add(u)
            out.append(j)
        return out

    def _keep_high_signal_jobs(self, jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        def is_high_signal_job_url(u: str) -> bool:
            u_low = (u or "").lower()
            if "/jobs/listing/" in u_low:
                return True
            if "gh_jid=" in u_low:
                return True
            # Greenhouse hosted boards (older + newer hostnames)
            if "boards.greenhouse.io" in u_low or "job-boards.greenhouse.io" in u_low:
                # Example: https://boards.greenhouse.io/<slug>/jobs/<id>
                return True
            if "lever.co" in u_low and ("/apply" in u_low or "/postings/" in u_low):
                return True
            if ORACLE_JOB_URL_RE.search(u_low) or ORACLE_JOB_URL_RE2.search(u_low) or ORACLE_REQ_URL_RE.search(u_low):
                return True
            if re.search(r"/(jobs|careers|positions|listing)/[^?#]*\d{4,}(\b|/|$)", u_low):
                return True
            return False

        high_signal: List[Dict[str, Any]] = []
        for j in jobs:
            u = (j.get("absolute_url") or j.get("url") or "").strip()
            if u and is_high_signal_job_url(u):
                high_signal.append(j)
        return high_signal

    def _detect_embedded_ats(self, html: str, final_url: str) -> List[Dict[str, str]]:
        """Detect embedded/linked ATS slugs within a career URL wrapper page.

        Returns a ranked list like:
            [{"type": "greenhouse", "slug": "applytocedar"}, ...]
        """
        blob = f"{final_url}\n{html or ''}"
        # Keep size bounded to avoid pathological HTML; regex-based checks don't need the full document.
        blob = blob[:300_000]
        low = blob.lower()

        found: List[Tuple[str, str]] = []

        # --- Greenhouse ---
        # Prefer explicit "for=<slug>" embed parameter (this is the Cedar pattern)
        m = re.search(r"greenhouse\.io/[^\s\"']*\bfor=([a-z0-9-]+)", low)
        if m:
            slug = (m.group(1) or "").strip().lower()
            if _is_valid_gh_slug(slug):
                found.append(("greenhouse", slug))

        for m in _RE_GH_API.finditer(low):
            slug = (m.group(1) or "").strip().lower()
            if _is_valid_gh_slug(slug):
                found.append(("greenhouse", slug))

        for m in _RE_GH_HOSTED_ANY.finditer(low):
            slug = (m.group(1) or "").strip().lower()
            if _is_valid_gh_slug(slug):
                found.append(("greenhouse", slug))

        # --- Lever ---
        for m in _RE_LEVER_API.finditer(low):
            slug = (m.group(1) or "").strip().lower()
            if slug:
                found.append(("lever", slug))
        for m in _RE_LEVER_HOSTED.finditer(low):
            slug = (m.group(1) or "").strip().lower()
            if slug:
                found.append(("lever", slug))

        # Uniq + rank: GH API > GH hosted > embed param; Lever API > Lever hosted
        rank = {"greenhouse": 0, "lever": 1}
        uniq: List[Tuple[str, str]] = []
        seen = set()
        for t, s in found:
            key = f"{t}:{s}"
            if key in seen:
                continue
            seen.add(key)
            uniq.append((t, s))

        uniq.sort(key=lambda x: (rank.get(x[0], 9), len(x[1])))
        return [{"type": t, "slug": s} for (t, s) in uniq][:5]

    # -------------------------
    # Existing helpers (kept)
    # -------------------------
    def _render_with_playwright(self, url: str) -> Tuple[str, str]:
        """
        Render a career listing page with Playwright.
        Production robustness:
        - Bounded by CAREERURL_TIME_BUDGET_S
        - Stops after CAREERURL_NO_PROGRESS_PAGES with no new content growth
        - Clicks common "Load more" buttons if present
        - Scrolls to trigger lazy loading
        """
        try:
            from playwright.sync_api import sync_playwright  # type: ignore
        except Exception:
            return "", url

        TIME_BUDGET_S = int(os.getenv("CAREERURL_TIME_BUDGET_S", "25"))
        NO_PROGRESS_PAGES = int(os.getenv("CAREERURL_NO_PROGRESS_PAGES", "2"))

        start = time.time()
        last_len = 0
        no_progress = 0

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=USER_AGENT)

            page.goto(url, wait_until="domcontentloaded", timeout=60000)

            # Let JS settle a bit
            try:
                page.wait_for_timeout(800)
            except Exception:
                pass

            def try_click_load_more() -> bool:
                # Try common patterns; we keep it generic
                candidates = [
                    "button:has-text('Load more')",
                    "button:has-text('Show more')",
                    "button:has-text('More jobs')",
                    "[data-qa*='load'] button",
                    "button[aria-label*='Load']",
                    "a:has-text('Load more')",
                    "a:has-text('Show more')",
                ]
                for sel in candidates:
                    try:
                        loc = page.locator(sel)
                        if loc.count() > 0 and loc.first.is_visible():
                            loc.first.click(timeout=1500)
                            return True
                    except Exception:
                        continue
                return False

            # Scroll / load-more loop (bounded)
            while (time.time() - start) < TIME_BUDGET_S:
                # Try clicking load more first
                clicked = try_click_load_more()

                # Scroll to bottom to trigger lazy loads
                try:
                    page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
                except Exception:
                    pass

                try:
                    page.wait_for_timeout(900 if clicked else 650)
                except Exception:
                    pass

                # Check if content grew
                try:
                    html = page.content() or ""
                except Exception:
                    html = ""

                cur_len = len(html)
                if cur_len <= last_len + 200:
                    no_progress += 1
                else:
                    no_progress = 0
                    last_len = cur_len

                if no_progress >= max(1, NO_PROGRESS_PAGES):
                    break

            try:
                html = page.content()
                final = page.url
            except Exception:
                html, final = "", url

            browser.close()
            return (html or ""), (final or url)

    def _extract_from_jsonld(self, html: str, base_url: str) -> List[Dict[str, Any]]:
        if BeautifulSoup is None:
            return []
        soup = BeautifulSoup(html, "html.parser")
        out: List[Dict[str, Any]] = []

        for s in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                data = json.loads(s.get_text(strip=True) or "{}")
            except Exception:
                continue

            nodes = data if isinstance(data, list) else [data]
            for node in nodes:
                if isinstance(node, dict) and "@graph" in node and isinstance(node["@graph"], list):
                    nodes.extend(node["@graph"])

            for node in nodes:
                if not isinstance(node, dict):
                    continue
                t = node.get("@type")
                if isinstance(t, list):
                    is_job = any(x == "JobPosting" for x in t)
                else:
                    is_job = (t == "JobPosting")
                if not is_job:
                    continue

                title = normalize_whitespace(str(node.get("title") or node.get("name") or ""))
                desc = str(node.get("description") or "")
                url = node.get("url") or node.get("hiringOrganization", {}).get("sameAs") or ""
                if isinstance(url, dict):
                    url = url.get("@id") or ""

                location = ""
                job_loc = node.get("jobLocation")
                if isinstance(job_loc, dict):
                    addr = job_loc.get("address") or {}
                    if isinstance(addr, dict):
                        city = addr.get("addressLocality") or ""
                        region = addr.get("addressRegion") or ""
                        country = addr.get("addressCountry") or ""
                        location = normalize_whitespace(f"{city}, {region} {country}".strip(" ,"))
                elif isinstance(job_loc, list) and job_loc:
                    jl = job_loc[0]
                    if isinstance(jl, dict):
                        addr = jl.get("address") or {}
                        if isinstance(addr, dict):
                            city = addr.get("addressLocality") or ""
                            region = addr.get("addressRegion") or ""
                            country = addr.get("addressCountry") or ""
                            location = normalize_whitespace(f"{city}, {region} {country}".strip(" ,"))

                abs_url = urljoin(base_url, str(url)) if url else base_url
                job_id = sha1_text(abs_url)

                out.append(
                    {
                        "id": job_id,
                        "title": title,
                        "location": {"name": location},
                        "content": desc,
                        "absolute_url": abs_url,
                        "departments": [],
                    }
                )

        return out

    def _extract_from_embedded_json(self, html: str, base_url: str) -> List[Dict[str, Any]]:
        if BeautifulSoup is None:
            return []
        soup = BeautifulSoup(html, "html.parser")
        out: List[Dict[str, Any]] = []

        next_data = soup.find("script", attrs={"id": "__NEXT_DATA__"})
        if next_data:
            try:
                data = json.loads(next_data.get_text(strip=True) or "{}")
                out.extend(self._find_jobs_in_json(data, base_url))
            except Exception:
                pass

        return out

    def _find_jobs_in_json(self, data: Any, base_url: str) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []

        def walk(node: Any):
            if isinstance(node, dict):
                title = node.get("title") or node.get("text") or node.get("name")
                url = node.get("url") or node.get("absolute_url") or node.get("applyUrl") or node.get("hostedUrl")
                loc = node.get("location") or node.get("jobLocation") or node.get("city")
                desc = node.get("description") or node.get("content") or ""
                if title and url:
                    abs_url = urljoin(base_url, str(url))
                    location = ""
                    if isinstance(loc, dict):
                        location = loc.get("name") or ""
                    elif isinstance(loc, str):
                        location = loc
                    job_id = sha1_text(abs_url)
                    out.append(
                        {
                            "id": job_id,
                            "title": normalize_whitespace(str(title)),
                            "location": {"name": normalize_whitespace(str(location))},
                            "content": str(desc),
                            "absolute_url": abs_url,
                            "departments": [],
                        }
                    )
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for it in node:
                    walk(it)

        walk(data)
        return out

    def _discover_and_fetch_job_links(self, html: str, base_url: str) -> List[Dict[str, Any]]:
        if BeautifulSoup is None:
            return []

        start = time.time()

        TIME_BUDGET_S = int(os.getenv("CAREERURL_TIME_BUDGET_S", "25"))
        MAX_CANDIDATES = int(os.getenv("CAREERURL_MAX_CANDIDATES", "60"))
        MAX_FETCH = int(os.getenv("CAREERURL_MAX_FETCH", "40"))
        DETAIL_TIMEOUT = int(os.getenv("CAREERURL_DETAIL_TIMEOUT_S", "20"))

        soup = BeautifulSoup(html, "html.parser")
        base = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"

        def is_high_signal_job_url(u: str) -> bool:
            u_low = (u or "").lower()
            if "/jobs/listing/" in u_low:
                return True
            if "gh_jid=" in u_low:
                return True
            if "lever.co" in u_low and ("/apply" in u_low or "/postings/" in u_low):
                return True
            if ORACLE_JOB_URL_RE.search(u_low) or ORACLE_JOB_URL_RE2.search(u_low) or ORACLE_REQ_URL_RE.search(u_low):
                return True
            if re.search(r"/(jobs|careers|positions|listing)/[^?#]*\d{4,}(\b|/|$)", u_low):
                return True
            return False

        candidates: List[str] = []
        for a in soup.select("a[href]"):
            href = (a.get("href") or "").strip()
            if not href:
                continue
            absu = urljoin(base, href)
            if is_high_signal_job_url(absu):
                candidates.append(absu)

        candidates = list(dict.fromkeys(candidates))[:MAX_CANDIDATES]
        if not candidates:
            return []

        out: List[Dict[str, Any]] = []
        fetched = 0

        for u in candidates:
            if fetched >= MAX_FETCH:
                break
            if (time.time() - start) > TIME_BUDGET_S:
                break

            for attempt in range(2):
                try:
                    r = _http_get(u, timeout=DETAIL_TIMEOUT)
                    parsed = self._parse_job_detail_page(u, r.text or "")
                    if parsed and parsed.get("title"):
                        out.append(parsed)
                        fetched += 1
                    break
                except Exception:
                    time.sleep(0.2 * (2**attempt))

        return [j for j in out if j.get("title") and (j.get("absolute_url") or j.get("url"))]

    def _parse_job_detail_page(self, url: str, html: str) -> Dict[str, Any]:
        if BeautifulSoup is None:
            return {}

        soup = BeautifulSoup(html, "html.parser")

        title = ""
        h1 = soup.find("h1")
        if h1:
            title = normalize_whitespace(h1.get_text(" ", strip=True))
        if not title:
            h2 = soup.find("h2")
            if h2:
                title = normalize_whitespace(h2.get_text(" ", strip=True))

        text = soup.get_text("\n", strip=True)
        location = ""

        m = re.search(r"(Office locations|Location)\s+([^\n]{2,120})", text, re.IGNORECASE)
        if m:
            location = normalize_whitespace(m.group(2))

        content = "\n".join(text.splitlines()[:2000])
        job_id = sha1_text(url)

        return {
            "id": job_id,
            "title": title,
            "location": {"name": location},
            "content": content,
            "absolute_url": url,
            "departments": [],
        }


# =========================
# Normalization
# =========================
def normalize_greenhouse_job(raw: Dict[str, Any], company_slug: str, label: str, employer_name: str) -> NormalizedJob:
    job_id = str(raw.get("id") or "")
    title = raw.get("title") or ""

    loc_name = ""
    loc_obj = raw.get("location")
    if isinstance(loc_obj, dict):
        loc_name = (loc_obj.get("name") or "").strip()
    elif isinstance(loc_obj, str):
        loc_name = loc_obj.strip()

    description = raw.get("content") or ""
    url = raw.get("absolute_url") or ""

    departments = raw.get("departments") or []
    department = ""
    if departments and isinstance(departments, list):
        department = departments[0].get("name") or ""

    return NormalizedJob(
        source_type="greenhouse",
        company_label=label,
        company_slug=company_slug,
        employer_name=employer_name or label,
        job_id=job_id,
        title=title,
        location=loc_name,
        description=description,
        url=url,
        department=department,
        work_mode=classify_work_mode(f"{title} {loc_name} {description[:500]}"),
        detected_from_url="",
    )


def normalize_lever_job(raw: Dict[str, Any], company_slug: str, label: str, employer_name: str) -> NormalizedJob:
    job_id = str(raw.get("id") or raw.get("shortcode") or "")
    title = raw.get("text") or raw.get("title") or ""
    loc = raw.get("categories", {}).get("location") or raw.get("location") or ""
    description = raw.get("description") or ""
    url = raw.get("hostedUrl") or raw.get("applyUrl") or ""

    department = raw.get("categories", {}).get("department") or ""
    team = raw.get("categories", {}).get("team") or ""

    return NormalizedJob(
        source_type="lever",
        company_label=label,
        company_slug=company_slug,
        employer_name=employer_name or label,
        job_id=job_id,
        title=title,
        location=loc,
        description=description,
        url=url,
        department=department,
        team=team,
        work_mode=classify_work_mode(f"{title} {loc} {description[:500]}"),
        detected_from_url="",
    )


def normalize_career_job(raw: Dict[str, Any], label: str, employer_name: str) -> NormalizedJob:
    job_id = str(raw.get("id") or "")
    title = raw.get("title") or ""

    loc_name = ""
    loc_obj = raw.get("location")
    if isinstance(loc_obj, dict):
        loc_name = (loc_obj.get("name") or "").strip()
    elif isinstance(loc_obj, str):
        loc_name = loc_obj.strip()

    description = raw.get("content") or raw.get("description") or ""
    url = raw.get("absolute_url") or raw.get("url") or ""

    detected_type = (raw.get("_detected_source_type") or "").strip() or "career_url"
    # When we auto-discover an ATS, keep its slug so UI/debugging can show something meaningful.
    # For plain scraped pages, fall back to using the label as a stable identifier.
    detected_slug = (raw.get("_detected_company_slug") or "").strip() or label
    detected_from_url = (raw.get("_detected_from_url") or "").strip()

    return NormalizedJob(
        source_type=detected_type,
        company_label=label,
        company_slug=detected_slug,
        employer_name=employer_name or label,
        job_id=job_id,
        title=title,
        location=loc_name,
        description=description,
        url=url,
        work_mode=classify_work_mode(f"{title} {loc_name} {description[:500]}"),
        detected_from_url=detected_from_url,
    )


# =========================
# Filter Agent
# =========================
class FilterAgent:
    def __init__(self, config: Dict[str, Any]):
        self.role_keywords: List[str] = config.get("role_keywords") or []
        self.include_keywords: List[str] = config.get("include_keywords") or []

        base_exclude: List[str] = config.get("exclude_keywords") or []
        visa_phrases = config.get("visa_restriction_phrases")
        if visa_phrases is None:
            visa_phrases = DEFAULT_VISA_RESTRICTION_PHRASES

        self.exclude_keywords: List[str] = list(base_exclude) + (
            list(visa_phrases) if isinstance(visa_phrases, list) else []
        )

        self.preferred_states: List[str] = [s.upper() for s in (config.get("preferred_states") or [])]
        self.allow_remote_us: bool = bool(config.get("allow_remote_us", True))
        self.work_mode_preference: str = (config.get("work_mode_preference") or "any").lower()

    def keep(self, job: NormalizedJob) -> bool:
        keep, _reasons = self.explain(job)
        return keep

    def _first_match(self, haystack: str, needles: List[str]) -> Optional[str]:
        h = (haystack or "").lower()
        for n in needles or []:
            n2 = (n or "").strip().lower()
            if n2 and n2 in h:
                return n
        return None

    def explain(self, job: NormalizedJob) -> Tuple[bool, List[str]]:
        """Return (keep, reasons[]) without changing the underlying filter behavior."""
        reasons: List[str] = []

        if not is_us_location(job.location):
            return False, ["location:not_us"]

        haystack = f"{job.title}\n{job.description}\n{job.location}"

        if self.exclude_keywords:
            hit = self._first_match(haystack, self.exclude_keywords)
            if hit:
                reasons.append(f"exclude:matched:{hit}")
                return False, reasons

        title_desc = f"{job.title}\n{job.description}"
        if self.role_keywords:
            hit = self._first_match(title_desc, self.role_keywords)
            if not hit:
                reasons.append("role_keywords:no_match")
                return False, reasons
            reasons.append(f"role_keywords:matched:{hit}")

        if self.include_keywords:
            hit = self._first_match(haystack, self.include_keywords)
            if not hit:
                reasons.append("include_keywords:no_match")
                return False, reasons
            reasons.append(f"include_keywords:matched:{hit}")

        if self.work_mode_preference != "any" and job.work_mode != self.work_mode_preference:
            reasons.append(f"work_mode:mismatch:{job.work_mode}->{self.work_mode_preference}")
            return False, reasons

        if is_remote_us(job.location):
            if not self.allow_remote_us:
                reasons.append("remote_us:blocked")
                return False, reasons
            reasons.append("remote_us:allowed")
            return True, reasons

        if self.preferred_states:
            st = extract_us_state_code(job.location)
            if not st:
                reasons.append("state:missing")
                return False, reasons
            if st not in self.preferred_states:
                reasons.append(f"state:not_allowed:{st}")
                return False, reasons
            reasons.append(f"state:allowed:{st}")

        return True, reasons


# =========================
# Source wiring
# =========================
def build_agents() -> Dict[str, SourceAgent]:
    return {"greenhouse": GreenhouseAgent(), "lever": LeverAgent(), "career_url": CareerUrlAgent()}


def fetch_all_sources(config: Dict[str, Any]) -> Tuple[List[NormalizedJob], Dict[str, str]]:
    from concurrent.futures import ThreadPoolExecutor, as_completed

    agents = build_agents()
    errors: Dict[str, str] = {}
    all_jobs: List[NormalizedJob] = []

    sources = config.get("sources") or []
    if not sources:
        return [], {}

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for src in sources:
        label = (src.get("label") or src.get("company_slug") or "unknown").strip()
        grouped.setdefault(label, []).append(src)

    max_workers = int(os.getenv("FETCH_MAX_WORKERS", "6"))

    def fetch_company(label: str, company_sources: List[Dict[str, Any]]) -> Tuple[str, List[NormalizedJob], Dict[str, str]]:
        company_jobs: List[NormalizedJob] = []
        company_errors: Dict[str, str] = {}

        for src in company_sources:
            src_type = (src.get("type") or "").strip().lower()
            key = f"{label}:{src_type}"
            employer_name = (src.get("employer_name") or label).strip()

            try:
                if src_type not in agents:
                    company_errors[key] = f"Unsupported source type: {src_type}"
                    continue

                if src_type in ("greenhouse", "lever"):
                    slug = (src.get("company_slug") or "").strip()
                    if not slug:
                        company_errors[key] = "Missing company_slug"
                        continue
                    raw_jobs = agents[src_type].fetch(slug, label, src)
                    for rj in raw_jobs:
                        if src_type == "greenhouse":
                            company_jobs.append(normalize_greenhouse_job(rj, slug, label, employer_name))
                        else:
                            company_jobs.append(normalize_lever_job(rj, slug, label, employer_name))

                elif src_type == "career_url":
                    raw_jobs = agents[src_type].fetch("", label, src)
                    for rj in raw_jobs:
                        company_jobs.append(normalize_career_job(rj, label, employer_name))

            except Exception as e:
                company_errors[key] = str(e)

        return label, company_jobs, company_errors

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = [pool.submit(fetch_company, label, srcs) for label, srcs in grouped.items()]
        for fut in as_completed(futures):
            label, jobs, errs = fut.result()
            all_jobs.extend(jobs)
            errors.update(errs)

    return all_jobs, errors
