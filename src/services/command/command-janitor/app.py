from __future__ import annotations

import asyncio
import signal
from pathlib import Path
from typing import Any

from domains.command.events import CommandCompletedBody
from packages.config.logs import get_logger
from packages.config.settings import env
from packages.events.bus import NatsEventBus, RecordedEventClient
from packages.runtime.async_db import AsyncDb
from packages.runtime.service import AsyncService
from packages.runtime.worker import HEARTBEAT_PATH
from packages.storage.database import Database, wait_for_database

COMMAND_JANITOR = "command-janitor"
SWEEP_INTERVAL_SECONDS_ENV = "COMMAND_JANITOR_INTERVAL_SECONDS"
DEFAULT_SWEEP_INTERVAL_SECONDS = "15"
LOGGER = get_logger(__name__)


async def emit_expired_command_completions(
    db: Any, events: Any, service_name: str = COMMAND_JANITOR
) -> int:
    expired = await db.fail_expired_agent_commands() or []
    for row in expired:
        command_id = str(row["command_id"])
        body = CommandCompletedBody(command_id=command_id, result=dict(row["result"]))
        await events.emit(
            body.__subject__,
            service_name,
            body.to_body(),
            correlation_id=f"{COMMAND_JANITOR}:{command_id}",
        )
    return len(expired)


async def run() -> None:
    db = Database()
    async_db = AsyncDb(db)
    bus = NatsEventBus()
    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    for item in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(item, stopping.set)

    await wait_for_database(db)
    await bus.connect()
    events = RecordedEventClient(bus, db)
    interval = float(env(SWEEP_INTERVAL_SECONDS_ENV, DEFAULT_SWEEP_INTERVAL_SECONDS))
    try:
        while not stopping.is_set():
            Path(HEARTBEAT_PATH).touch()
            count = await emit_expired_command_completions(async_db, events)
            if count:
                LOGGER.warning("expired_commands_swept", extra={"context": {"count": count}})
            try:
                await asyncio.wait_for(stopping.wait(), timeout=interval)
            except TimeoutError:
                continue
    finally:
        await bus.close()
        dispose = getattr(db, "dispose", None)
        if dispose is not None:
            dispose()


if __name__ == "__main__":
    AsyncService(COMMAND_JANITOR, run).run()
