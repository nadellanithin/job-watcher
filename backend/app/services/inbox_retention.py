from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Sequence, Union

logger = logging.getLogger("inbox_retention")


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def deactivate_expired_jobs(con, *, ttl_days: int) -> int:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=int(ttl_days))).isoformat()
    cur = con.execute(
        """
        UPDATE jobs_catalog
        SET is_active = 0
        WHERE is_active = 1
          AND COALESCE(last_seen, '') <> ''
          AND julianday(last_seen) < julianday(?)
        """,
        (cutoff,),
    )
    return int(cur.rowcount or 0)


def count_active_jobs(con) -> int:
    row = con.execute(
        "SELECT COUNT(*) AS c FROM jobs_catalog WHERE is_active = 1"
    ).fetchone()
    return int(row["c"]) if row else 0


def _deactivate_oldest_active_by_status(
    con,
    *,
    statuses: Sequence[str],
    limit: int,
) -> int:
    if not statuses or int(limit) <= 0:
        return 0

    placeholders = ",".join(["?"] * len(statuses))
    rows = con.execute(
        f"""
        SELECT dedupe_key
        FROM jobs_catalog
        WHERE is_active = 1
          AND review_status IN ({placeholders})
        ORDER BY COALESCE(julianday(last_seen), 0) ASC, COALESCE(last_seen, '') ASC, dedupe_key ASC
        LIMIT ?
        """,
        tuple(statuses) + (int(limit),),
    ).fetchall()

    keys = [r["dedupe_key"] for r in (rows or []) if r and r["dedupe_key"]]
    if not keys:
        return 0

    q = ",".join(["?"] * len(keys))
    con.execute(f"UPDATE jobs_catalog SET is_active = 0 WHERE dedupe_key IN ({q})", keys)
    return len(keys)


def enforce_active_row_cap(con, *, max_active_rows: int) -> Dict[str, int]:
    initial_active = count_active_jobs(con)
    overflow = max(0, initial_active - int(max_active_rows))

    removed_reviewed = 0
    removed_excluded_ignored = 0
    removed_unreviewed = 0

    if overflow > 0:
        removed_reviewed = _deactivate_oldest_active_by_status(
            con,
            statuses=("include", "exclude", "ignore"),
            limit=overflow,
        )
        overflow -= removed_reviewed

    if overflow > 0:
        removed_excluded_ignored = _deactivate_oldest_active_by_status(
            con,
            statuses=("exclude", "ignore"),
            limit=overflow,
        )
        overflow -= removed_excluded_ignored

    if overflow > 0:
        logger.warning(
            "[inbox] Active rows still above cap after reviewed eviction. Deactivating %s oldest unreviewed rows as last resort.",
            overflow,
        )
        removed_unreviewed = _deactivate_oldest_active_by_status(
            con,
            statuses=("unreviewed",),
            limit=overflow,
        )
        overflow -= removed_unreviewed

    final_active = count_active_jobs(con)
    if final_active > int(max_active_rows):
        logger.warning(
            "[inbox] Active rows remain above cap: active=%s cap=%s",
            final_active,
            max_active_rows,
        )

    return {
        "initial_active": initial_active,
        "final_active": final_active,
        "removed_reviewed": removed_reviewed,
        "removed_excluded_ignored": removed_excluded_ignored,
        "removed_unreviewed": removed_unreviewed,
    }


def apply_space_management(
    con,
    *,
    ttl_days: int,
    max_active_rows: int,
) -> Dict[str, Union[int, str]]:
    expired = deactivate_expired_jobs(con, ttl_days=ttl_days)
    cap_stats = enforce_active_row_cap(con, max_active_rows=max_active_rows)
    return {
        "expired_deactivated": int(expired),
        **cap_stats,
        "enforced_at": _now_utc_iso(),
    }
