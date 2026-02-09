from __future__ import annotations

from typing import Any, Dict, List

# Import your existing logic (copied as-is)
import app.legacy.job_fetcher_legacy as legacy


def normalized_job_to_dict(j: legacy.NormalizedJob) -> Dict[str, Any]:
    """
    Convert legacy NormalizedJob dataclass into dict schema expected by new pipeline.
    """
    return {
        # new schema keys
        "job_id": j.job_id or "",
        "title": j.title or "",
        "location": j.location or "",
        "department": getattr(j, "department", "") or "",
        "team": getattr(j, "team", "") or "",
        "url": j.url or "",
        "description": j.description or "",
        "date_posted": "",  # legacy doesn't consistently provide; keep best-effort later
        "source_type": j.source_type or "",
        "company_name": j.company_label or "",
        # not stored in DB schema, but useful for source persistence + debugging
        "company_slug": getattr(j, "company_slug", "") or "",
        "detected_from_url": getattr(j, "detected_from_url", "") or "",

        # helpful extra (not stored in DB schema, but used for H1B marking)
        "employer_name": j.employer_name or j.company_label or "",
        "work_mode": getattr(j, "work_mode", "unknown") or "unknown",

        # fields filled later by state layer
        "past_h1b_support": "no",
        "first_seen": "",
        "dedupe_key": "",
    }


def fetch_jobs_via_legacy(config: Dict[str, Any]) -> tuple[List[Dict[str, Any]], Dict[str, str], List[str], List[Dict[str, Any]]]:
    """
    Runs the legacy fetch + filter + H1B marking,
    but DOES NOT call legacy run_once (because it writes files + state.json). :contentReference[oaicite:3]{index=3}
    Returns:
      kept_jobs_as_dicts, per_source_errors, h1b_load_errors, discovered_sources
    """
    # 1) Fetch raw + normalize using legacy (Greenhouse/Lever) :contentReference[oaicite:4]{index=4}
    raw_jobs, errors = legacy.fetch_all_sources(config)

    # Capture ATS discoveries emitted via career_url auto-discovery.
    # If a career_url wrapper page detects GH/Lever and we fetch from the API,
    # normalize_career_job sets:
    #   - source_type: greenhouse|lever
    #   - company_slug: detected ATS slug
    #   - detected_from_url: original career_url
    discovered: List[Dict[str, Any]] = []
    seen_disc = set()
    for j in raw_jobs:
        try:
            st = (j.source_type or "").strip().lower()
            slug = (getattr(j, "company_slug", "") or "").strip()
            from_url = (getattr(j, "detected_from_url", "") or "").strip()
            label = (j.company_label or "").strip()
            if st in ("greenhouse", "lever") and slug and from_url and label:
                key = (label.lower(), st, slug, from_url)
                if key in seen_disc:
                    continue
                seen_disc.add(key)
                discovered.append(
                    {
                        "company_name": label,
                        "source_type": st,
                        "slug": slug,
                        "from_url": from_url,
                        "employer_name": (j.employer_name or label),
                    }
                )
        except Exception:
            continue

    # 2) Apply the exact legacy FilterAgent logic (US-only, remote/states, keywords, visa phrases, work-mode) :contentReference[oaicite:5]{index=5}
    filter_agent = legacy.FilterAgent(config)
    kept = [j for j in raw_jobs if filter_agent.keep(j)]

    # 3) Load H1B agent using legacy (downloads/caches USCIS export CSVs) :contentReference[oaicite:6]{index=6}
    years = config.get("uscis_h1b_years") or []
    cache_dir = config.get("uscis_h1b_cache_dir") or "./.cache/uscis_h1b"
    h1b_agent = legacy.H1BSupportAgent(years=years, cache_dir=cache_dir)

    # 4) Mark past H1B support exactly like legacy run_once does :contentReference[oaicite:7]{index=7}
    if h1b_agent.loaded:
        for j in kept:
            j.past_h1b_support = "yes" if h1b_agent.has_past_h1b_support(j.employer_name) else "no"
    else:
        for j in kept:
            j.past_h1b_support = "no"

    kept_dicts = [normalized_job_to_dict(j) for j in kept]
    # Copy the computed past_h1b_support into dict version
    for d, j in zip(kept_dicts, kept):
        d["past_h1b_support"] = j.past_h1b_support

    return kept_dicts, errors, h1b_agent.load_errors, discovered
