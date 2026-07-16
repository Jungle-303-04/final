from __future__ import annotations

import asyncio
import signal
from pathlib import Path
from typing import Any

from domains.command.events import CommandCompletedBody
from domains.command.repository import QUEUED_COMMAND_TTL_SECONDS
from packages.config.logs import get_logger
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import EventConsumerBus
from packages.events.bus import NatsEventBus, RecordedEventClient
from packages.events.context import event_workspace
from packages.runtime.async_db import AsyncDb
from packages.runtime.service import AsyncService
from packages.runtime.worker import HEARTBEAT_PATH
from packages.storage.database import Database, wait_for_database
from packages.storage.retention import sweep_storage_retention

COMMAND_JANITOR = "command-janitor"
SWEEP_INTERVAL_SECONDS_ENV = "COMMAND_JANITOR_INTERVAL_SECONDS"
QUEUE_TTL_SECONDS_ENV = "COMMAND_QUEUE_TTL_SECONDS"
RETENTION_SWEEP_INTERVAL_SECONDS_ENV = "DB_RETENTION_SWEEP_INTERVAL_SECONDS"
DEFAULT_SWEEP_INTERVAL_SECONDS = "15"
DEFAULT_RETENTION_SWEEP_INTERVAL_SECONDS = "3600"
LOGGER = get_logger(__name__)


async def emit_expired_command_completions(
    db: Any, events: Any, service_name: str = COMMAND_JANITOR
) -> int:
    try:
        queue_ttl_seconds = int(env(QUEUE_TTL_SECONDS_ENV, str(QUEUED_COMMAND_TTL_SECONDS)))
        expired = await db.fail_expired_agent_commands(queue_ttl_seconds=queue_ttl_seconds) or []
    except Exception:
        # rollout 시 schema lock 같은 일시 DB 경합은 다음 주기에 재시도한다.
        LOGGER.exception("expired_command_sweep_failed")
        return 0
    for row in expired:
        command_id = str(row["command_id"])
        workspace_id = str(row.get("workspace_id") or "default")
        result = dict(row["result"])
        body = CommandCompletedBody(command_id=command_id, result=result)
        correlation_id = str(row.get("correlation_id") or f"{COMMAND_JANITOR}:{command_id}")
        with event_workspace(workspace_id):
            await events.emit(
                body.__subject__,
                service_name,
                body.to_body(),
                correlation_id=correlation_id,
            )
    return len(expired)


async def sweep_database_retention(db: Any) -> int:
    try:
        result = await sweep_storage_retention(db)
    except Exception:
        LOGGER.exception("database_retention_sweep_failed")
        return 0
    return result.total


async def run(event_bus: EventConsumerBus | None = None) -> None:
    db = Database()
    async_db = AsyncDb(db)
    bus = event_bus or NatsEventBus()
    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    for item in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(item, stopping.set)

    await wait_for_database(db)
    await bus.connect()
    events = RecordedEventClient(bus, db)
    interval = float(env(SWEEP_INTERVAL_SECONDS_ENV, DEFAULT_SWEEP_INTERVAL_SECONDS))
    retention_interval = float(
        env(RETENTION_SWEEP_INTERVAL_SECONDS_ENV, DEFAULT_RETENTION_SWEEP_INTERVAL_SECONDS)
    )
    next_retention_sweep = 0.0
    try:
        while not stopping.is_set():
            Path(HEARTBEAT_PATH).touch()
            count = await emit_expired_command_completions(async_db, events)
            if count:
                LOGGER.warning("expired_commands_swept", extra={"context": {"count": count}})
            loop_time = loop.time()
            if loop_time >= next_retention_sweep:
                retention_count = await sweep_database_retention(async_db)
                next_retention_sweep = loop_time + retention_interval
                if retention_count:
                    LOGGER.warning(
                        "database_retention_swept",
                        extra={"context": {"count": retention_count}},
                    )
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
