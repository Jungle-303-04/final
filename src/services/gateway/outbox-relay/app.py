from __future__ import annotations

import asyncio
import signal
from pathlib import Path

from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.events.bus import NatsEventBus
from packages.runtime.relay import OutboxRelay
from packages.runtime.service import AsyncService
from packages.runtime.worker import HEARTBEAT_PATH
from packages.storage.database import Database, wait_for_database

OUTBOX_RELAY = "outbox-relay"
OUTBOX_RELAY_SOURCE = "api-gateway"
OUTBOX_RELAY_INTERVAL_SECONDS_ENV = (
    "OUTBOX_RELAY_INTERVAL_SECONDS"  # outbox relay 유휴 간격 초(기본 1)
)
DEFAULT_OUTBOX_RELAY_INTERVAL_SECONDS = 1.0
LOGGER = get_logger(__name__)


async def run() -> None:
    db = Database()
    bus = NatsEventBus()
    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    for item in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(item, stopping.set)

    Path(HEARTBEAT_PATH).touch()
    await wait_for_database(db)
    await bus.connect()
    relay = OutboxRelay(db, bus, OUTBOX_RELAY_SOURCE)
    interval = float(
        env(OUTBOX_RELAY_INTERVAL_SECONDS_ENV, str(DEFAULT_OUTBOX_RELAY_INTERVAL_SECONDS))
    )
    lifecycle = {"relay_source": OUTBOX_RELAY_SOURCE}
    LOGGER.info("outbox_relay_started", extra={CONTEXT_KEY: lifecycle})
    try:
        while not stopping.is_set():
            Path(HEARTBEAT_PATH).touch()
            try:
                sent = await relay.run_once()
            except Exception as exc:
                LOGGER.warning(
                    "outbox_relay_error",
                    extra={
                        CONTEXT_KEY: {
                            **lifecycle,
                            "exception_type": type(exc).__name__,
                        }
                    },
                    exc_info=exc,
                )
                sent = 0
            if sent >= relay.batch:
                continue
            try:
                await asyncio.wait_for(stopping.wait(), timeout=interval)
            except TimeoutError:
                continue
    finally:
        await bus.close()
        dispose_async = getattr(db, "dispose_async", None)
        if dispose_async is not None:
            await dispose_async()
        dispose = getattr(db, "dispose", None)
        if dispose is not None:
            dispose()


if __name__ == "__main__":
    AsyncService(OUTBOX_RELAY, run).run()
