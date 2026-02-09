import asyncio
import os
import logging
from typing import Optional
from datetime import datetime, timezone, timedelta

from app.services.runner import RunnerService

logger = logging.getLogger("scheduler")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class SchedulerService:
    def __init__(self, app):
        self.app = app
        self.task: Optional[asyncio.Task] = None
        self.running = False

        # status fields
        self.mode = (os.getenv("SCHEDULER_MODE") or "off").lower()
        self.interval_minutes = int(os.getenv("REFRESH_INTERVAL_MINUTES") or "15")

        self.last_run_started_at: Optional[str] = None
        self.last_run_finished_at: Optional[str] = None
        self.last_run_stats: Optional[dict] = None
        self.last_error: Optional[str] = None

        self.next_run_at: Optional[str] = None  # ISO

    async def start(self):
        self.mode = (os.getenv("SCHEDULER_MODE") or "off").lower()
        self.interval_minutes = int(os.getenv("REFRESH_INTERVAL_MINUTES") or "15")

        logger.info(f"Scheduler mode = {self.mode}")

        if self.mode == "off":
            self.running = False
            self.next_run_at = None
            return

        if self.mode == "cron":
            self.running = True
            await self.run_once(trigger="startup-cron")
            self.running = False
            self.next_run_at = None
            return

        if self.mode == "loop":
            if not self.running:
                self.running = True
                self.task = asyncio.create_task(self.loop_runner())

    async def stop(self):
        self.running = False
        if self.task:
            self.task.cancel()
        self.next_run_at = None

    def _set_next_run_eta(self):
        if self.mode != "loop" or not self.running:
            self.next_run_at = None
            return
        eta = now_utc() + timedelta(minutes=self.interval_minutes)
        self.next_run_at = eta.isoformat()

    async def run_once(self, trigger: str = "manual"):
        self.last_error = None
        started = now_utc().isoformat()
        self.last_run_started_at = started

        logger.info(f"Scheduler executing run_once() trigger={trigger}")

        runner = RunnerService(self.app.state.db)
        try:
            result = runner.run_once()
            # runner returns run_id + stats
            self.last_run_stats = result.get("stats")
            self.last_run_finished_at = now_utc().isoformat()
            logger.info(f"Scheduler run complete: {result}")
        except Exception as e:
            self.last_error = str(e)
            self.last_run_finished_at = now_utc().isoformat()
            logger.exception("Scheduler run failed")
        finally:
            self._set_next_run_eta()

    async def loop_runner(self):
        logger.info(f"Scheduler loop interval = {self.interval_minutes} minutes")
        self._set_next_run_eta()

        while self.running:
            await self.run_once(trigger="loop")
            await asyncio.sleep(self.interval_minutes * 60)

    def status(self) -> dict:
        return {
            "mode": self.mode,
            "interval_minutes": self.interval_minutes,
            "running": bool(self.running),
            "last_run_started_at": self.last_run_started_at,
            "last_run_finished_at": self.last_run_finished_at,
            "last_run_stats": self.last_run_stats,
            "last_error": self.last_error,
            "next_run_at": self.next_run_at,
        }
