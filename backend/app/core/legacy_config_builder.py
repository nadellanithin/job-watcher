from typing import Any, Dict, List


def build_legacy_config(settings: Dict[str, Any], legacy_sources: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Produce the exact config shape job_fetcher_legacy expects."""
    cfg: Dict[str, Any] = {}

    # Keywords
    cfg["role_keywords"] = settings.get("role_keywords") or []
    cfg["include_keywords"] = settings.get("include_keywords") or []
    cfg["exclude_keywords"] = settings.get("exclude_keywords") or []
    cfg["visa_restriction_phrases"] = settings.get("visa_restriction_phrases") or []

    # Smarter filtering (deterministic)
    cfg["exclude_exceptions"] = settings.get("exclude_exceptions") or []
    cfg["filter_mode"] = settings.get("filter_mode") or "smart"  # smart|score
    cfg["min_score_to_include"] = settings.get("min_score_to_include") if settings.get("min_score_to_include") is not None else 3

    # Location / work mode
    cfg["us_only"] = bool(settings.get("us_only", True))
    cfg["allow_remote_us"] = bool(settings.get("allow_remote_us", True))
    cfg["preferred_states"] = settings.get("preferred_states") or []

    # Back-compat: some parts of the app send work_mode; FilterAgent prefers work_mode_preference.
    cfg["work_mode"] = settings.get("work_mode") or "any"
    cfg["work_mode_preference"] = settings.get("work_mode_preference") or cfg["work_mode"]

    # H1B cache signals (optional)
    cfg["uscis_h1b_years"] = settings.get("uscis_h1b_years") or []
    cfg["uscis_h1b_cache_dir"] = settings.get("uscis_h1b_cache_dir") or "./.cache/uscis_h1b"

    cfg["sources"] = legacy_sources
    return cfg
