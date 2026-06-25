from __future__ import annotations

import asyncio
import json
import signal
from collections.abc import Callable

from packages.shared.contracts import EventHandler
from packages.shared.core import Database, EventBus, wait_for_database


class WorkerRuntime:
    def __init__(
        self, role: str, subject: str, handler_factory: Callable[[EventBus, Database], EventHandler]
    ) -> None:
        self.role = role
        self.subject = subject
        self.db = Database()
        self.bus = EventBus()
        self.handler_factory = handler_factory

    async def run(self) -> None:
        await wait_for_database(self.db)
        await self.bus.connect()
        sub = await self.bus.subscribe(self.subject, durable=self.role)
        handler = self.handler_factory(self.bus, self.db)
        stopping = asyncio.Event()
        signal.signal(signal.SIGTERM, lambda *_: stopping.set())
        signal.signal(signal.SIGINT, lambda *_: stopping.set())
        print(f"{self.role} subscribed to {self.subject}", flush=True)

        while not stopping.is_set():
            try:
                messages = await sub.fetch(1, timeout=1)
            except TimeoutError:
                continue
            except Exception as exc:
                print(f"{self.role} fetch error: {exc}", flush=True)
                await asyncio.sleep(1)
                continue

            for message in messages:
                try:
                    evt = json.loads(message.data.decode())
                    self.db.record_event(evt)
                    await handler(evt)
                    await message.ack()
                except Exception as exc:
                    print(f"{self.role} handler error: {exc}", flush=True)
                    await message.nak(delay=2)

        await self.bus.close()
