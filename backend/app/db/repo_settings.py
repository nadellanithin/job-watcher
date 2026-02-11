import json
from typing import Any, Dict, Optional

DEFAULT_SETTINGS = {
    # Keywords
    "role_keywords": [],
    "include_keywords": [],
    "exclude_keywords": [],
    "visa_restriction_phrases": [],

    # Smarter filtering
    "exclude_exceptions": [],
    "filter_mode": "smart",  # smart|score
    "min_score_to_include": 3,

    # Location / work mode
    "us_only": True,
    "allow_remote_us": True,
    "preferred_states": [],
    "work_mode": "any",  # any|remote|hybrid|onsite

    # H1B
    "uscis_h1b_years": [],
    "uscis_h1b_cache_dir": "./.cache/uscis_h1b",

    # Local ML relevance (free, CPU)
    # rank_only: only affects ordering (safe)
    # rescue: can include borderline/no-signal jobs (guarded; implemented later)
    "ml_enabled": False,
    "ml_mode": "rank_only",  # rank_only|rescue
    "ml_rescue_threshold": 0.85,
}

def get_settings(con, user_id: str) -> Dict[str, Any]:
    row = con.execute(
        "SELECT settings_json FROM settings WHERE user_id=?",
        (user_id,)
    ).fetchone()

    if not row:
        # auto-create defaults
        con.execute(
            "INSERT INTO settings(user_id, settings_json) VALUES(?,?)",
            (user_id, json.dumps(DEFAULT_SETTINGS))
        )
        con.commit()
        return dict(DEFAULT_SETTINGS)

    try:
        data = json.loads(row["settings_json"])
    except Exception:
        data = {}

    # merge defaults (so new fields appear automatically)
    merged = dict(DEFAULT_SETTINGS)
    merged.update(data or {})
    return merged

def update_settings(con, user_id: str, settings: Dict[str, Any]) -> Dict[str, Any]:
    # merge + persist
    current = get_settings(con, user_id)
    current.update(settings or {})

    con.execute(
        "INSERT INTO settings(user_id, settings_json) VALUES(?,?) "
        "ON CONFLICT(user_id) DO UPDATE SET settings_json=excluded.settings_json",
        (user_id, json.dumps(current))
    )
    con.commit()
    return current
