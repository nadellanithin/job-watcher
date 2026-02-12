import json
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict

logger = logging.getLogger("config")


def get_db_path() -> str:
    raw = os.environ.get("DB_PATH", "./job_watcher.sqlite3")
    return os.path.abspath(raw)


@dataclass(frozen=True)
class RuntimeConfig:
    retention_max_runs: int
    inbox_active_ttl_days: int
    inbox_max_active_rows: int
    keep_all_feedback: bool


def _parse_int_with_floor(
    env_name: str,
    *,
    default_value: int,
    minimum_floor: int,
) -> int:
    raw = os.getenv(env_name)
    if raw is None or not str(raw).strip():
        value = int(default_value)
    else:
        try:
            value = int(str(raw).strip())
        except Exception:
            logger.warning(
                "[config] %s=%r is invalid. Using default %s.",
                env_name,
                raw,
                default_value,
            )
            value = int(default_value)

    if value < minimum_floor:
        logger.warning(
            "[config] %s=%s below minimum (%s). Using %s.",
            env_name,
            value,
            minimum_floor,
            minimum_floor,
        )
        value = minimum_floor

    return value


def _parse_bool(env_name: str, *, default_value: bool) -> bool:
    raw = os.getenv(env_name)
    if raw is None or not str(raw).strip():
        return bool(default_value)

    normalized = str(raw).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False

    logger.warning(
        "[config] %s=%r is invalid boolean. Using default %s.",
        env_name,
        raw,
        default_value,
    )
    return bool(default_value)


@lru_cache(maxsize=1)
def get_runtime_config() -> RuntimeConfig:
    cfg = RuntimeConfig(
        retention_max_runs=_parse_int_with_floor(
            "RETENTION_MAX_RUNS",
            default_value=14,
            minimum_floor=7,
        ),
        inbox_active_ttl_days=_parse_int_with_floor(
            "INBOX_ACTIVE_TTL_DAYS",
            default_value=60,
            minimum_floor=30,
        ),
        inbox_max_active_rows=_parse_int_with_floor(
            "INBOX_MAX_ACTIVE_ROWS",
            default_value=50000,
            minimum_floor=10000,
        ),
        keep_all_feedback=_parse_bool("KEEP_ALL_FEEDBACK", default_value=True),
    )

    logger.info(
        "[config] effective RETENTION_MAX_RUNS=%s INBOX_ACTIVE_TTL_DAYS=%s INBOX_MAX_ACTIVE_ROWS=%s KEEP_ALL_FEEDBACK=%s",
        cfg.retention_max_runs,
        cfg.inbox_active_ttl_days,
        cfg.inbox_max_active_rows,
        cfg.keep_all_feedback,
    )
    print(
        "[config] effective "
        f"RETENTION_MAX_RUNS={cfg.retention_max_runs} "
        f"INBOX_ACTIVE_TTL_DAYS={cfg.inbox_active_ttl_days} "
        f"INBOX_MAX_ACTIVE_ROWS={cfg.inbox_max_active_rows} "
        f"KEEP_ALL_FEEDBACK={str(cfg.keep_all_feedback).lower()}"
    )
    return cfg


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
