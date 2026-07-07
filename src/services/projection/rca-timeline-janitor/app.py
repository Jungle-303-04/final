from __future__ import annotations

import asyncio
import signal
from pathlib import Path
from typing import Any

from packages.config.logs import get_logger
from packages.config.settings import env
from packages.runtime.async_db import AsyncDb
from packages.runtime.service import AsyncService
from packages.runtime.worker import HEARTBEAT_PATH
from packages.storage.database import Database, wait_for_database

RCA_TIMELINE_JANITOR = "rca-timeline-janitor"
SWEEP_INTERVAL_SECONDS_ENV = "RCA_TIMELINE_JANITOR_INTERVAL_SECONDS"
EXPIRE_DAYS_ENV = "RCA_OPEN_INCIDENT_EXPIRE_DAYS"
EXPIRE_LIMIT_ENV = "RCA_OPEN_INCIDENT_EXPIRE_LIMIT"
DEFAULT_SWEEP_INTERVAL_SECONDS = "900"
DEFAULT_EXPIRE_DAYS = "3"
DEFAULT_EXPIRE_LIMIT = "500"
LOGGER = get_logger(__name__)


async def expire_stale_open_incidents(db: Any) -> int:
    expired = await db.expire_stale_open_rca_incidents(
        max_age_days=int(env(EXPIRE_DAYS_ENV, DEFAULT_EXPIRE_DAYS)),
        limit=int(env(EXPIRE_LIMIT_ENV, DEFAULT_EXPIRE_LIMIT)),
    )
    return len(expired or [])


async def run() -> None:
    db = Database()
    async_db = AsyncDb(db)
    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    for item in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(item, stopping.set)

    await wait_for_database(db)
    interval = float(env(SWEEP_INTERVAL_SECONDS_ENV, DEFAULT_SWEEP_INTERVAL_SECONDS))
    try:
        while not stopping.is_set():
            Path(HEARTBEAT_PATH).touch()
            count = await expire_stale_open_incidents(async_db)
            if count:
                LOGGER.warning("stale_open_incidents_expired", extra={"context": {"count": count}})
            try:
                await asyncio.wait_for(stopping.wait(), timeout=interval)
            except TimeoutError:
                continue
    finally:
        dispose = getattr(db, "dispose", None)
        if dispose is not None:
            dispose()


if __name__ == "__main__":
    AsyncService(RCA_TIMELINE_JANITOR, run).run()
