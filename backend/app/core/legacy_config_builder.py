from typing import Any, Dict, List

def build_legacy_config(settings: Dict[str, Any], legacy_sources: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Produce the exact config shape job_fetcher_legacy expects.
    """
    cfg: Dict[str, Any] = {}

    # map settings to legacy expected keys (keep same names you currently use in config.json)
    # We'll keep them identical so FilterAgent keeps working.
    cfg["role_keywords"] = settings.get("role_keywords") or []
    cfg["include_keywords"] = settings.get("include_keywords") or []
    cfg["exclude_keywords"] = settings.get("exclude_keywords") or []
    cfg["visa_restriction_phrases"] = settings.get("visa_restriction_phrases") or []

    cfg["us_only"] = bool(settings.get("us_only", True))
    cfg["allow_remote_us"] = bool(settings.get("allow_remote_us", True))
    cfg["preferred_states"] = settings.get("preferred_states") or []
    cfg["work_mode"] = settings.get("work_mode") or "any"

    cfg["uscis_h1b_years"] = settings.get("uscis_h1b_years") or []
    cfg["uscis_h1b_cache_dir"] = settings.get("uscis_h1b_cache_dir") or "./.cache/uscis_h1b"

    cfg["sources"] = legacy_sources
    return cfg
