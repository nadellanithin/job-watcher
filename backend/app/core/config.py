import json
import os
from typing import Any, Dict

def load_legacy_config(path: str) -> Dict[str, Any]:
    """
    Loads your existing config.json (legacy format) exactly as-is.
    """
    if not path:
        raise ValueError("config path is required")

    # Make relative paths resolve from backend working directory
    abs_path = os.path.abspath(path)

    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"Config file not found: {abs_path}")

    with open(abs_path, "r", encoding="utf-8") as f:
        return json.load(f)
