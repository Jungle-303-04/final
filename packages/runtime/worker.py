from __future__ import annotations

import asyncio
import json
import signal
from collections.abc import Callable
from dataclasses import dataclass

from packages.contracts.event_bus.fields import EVENT_ID
from packages.contracts.event_bus.interfaces import (
    EventClient,
    EventConsumerBus,
    EventHandler,
    EventMessage,
)
from packages.contracts.event_bus.processing import EventProcessingStatus
from packages.events.bus import DeadLetterSink, EventBus, RecordedEventClient, event_causation
from packages.storage.database import Database, wait_for_database

DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_RETRY_DELAY_SECONDS = 2
DEFAULT_FETCH_BATCH_SIZE = 1
DEFAULT_FETCH_TIMEOUT_SECONDS = 1


@dataclass(frozen=True)
class EventRetryPolicy:
    max_attempts: int = DEFAULT_MAX_ATTEMPTS
    retry_delay_seconds: int = DEFAULT_RETRY_DELAY_SECONDS
    fetch_batch_size: int = DEFAULT_FETCH_BATCH_SIZE
    fetch_timeout_seconds: int = DEFAULT_FETCH_TIMEOUT_SECONDS


@dataclass(frozen=True)
class EventHandlerSpec:
    service_name: str
    subject: str
    handler_factory: Callable[[EventClient, Database], EventHandler]
    durable_name: str | None = None
    retry_policy: EventRetryPolicy = EventRetryPolicy()

    @property
    def durable(self) -> str:
        return self.durable_name or self.service_name


class EventProcessor:
    def __init__(
        self,
        service_name: str,
        handler: EventHandler,
        db: Database,
        dead_letters: DeadLetterSink,
        retry_policy: EventRetryPolicy,
    ) -> None:
        self.service_name = service_name
        self.handler = handler
        self.db = db
        self.dead_letters = dead_letters
        self.retry_policy = retry_policy

    async def process(self, message: EventMessage) -> None:
        evt = json.loads(message.data.decode())
        self.db.record_event(evt)
        processing = self.db.begin_event_processing(evt, self.service_name)
        if processing["status"] != EventProcessingStatus.PROCESSING:
            await message.ack()
            return

        attempts = int(processing["attempts"])
        try:
            with event_causation(evt[EVENT_ID]):
                await self.handler(evt)
            self.db.finish_event_processing(evt, self.service_name)
            await message.ack()
        except Exception as exc:
            if attempts >= self.retry_policy.max_attempts:
                self.db.fail_event_processing(
                    evt, self.service_name, str(exc), EventProcessingStatus.DEAD_LETTERED
                )
                await self.dead_letters.capture(evt, self.service_name, exc, attempts)
                await message.ack()
                return

            self.db.fail_event_processing(
                evt, self.service_name, str(exc), EventProcessingStatus.RETRYING
            )
            await message.nak(delay=self.retry_policy.retry_delay_seconds)


class WorkerRuntime:
    def __init__(
        self,
        spec: EventHandlerSpec,
        bus: EventConsumerBus | None = None,
        db: Database | None = None,
    ) -> None:
        self.spec = spec
        self.db = db or Database()
        self.bus = bus or EventBus()

    async def run(self) -> None:
        await wait_for_database(self.db)
        await self.bus.connect()
        sub = await self.bus.subscribe(self.spec.subject, durable=self.spec.durable)
        events = RecordedEventClient(self.bus, self.db)
        handler = self.spec.handler_factory(events, self.db)
        processor = EventProcessor(
            self.spec.service_name,
            handler,
            self.db,
            DeadLetterSink(events, self.db, self.spec.service_name),
            self.spec.retry_policy,
        )
        stopping = asyncio.Event()
        signal.signal(signal.SIGTERM, lambda *_: stopping.set())
        signal.signal(signal.SIGINT, lambda *_: stopping.set())
        print(f"{self.spec.service_name} subscribed to {self.spec.subject}", flush=True)

        while not stopping.is_set():
            try:
                messages = await sub.fetch(
                    self.spec.retry_policy.fetch_batch_size,
                    timeout=self.spec.retry_policy.fetch_timeout_seconds,
                )
            except TimeoutError:
                continue
            except Exception as exc:
                print(f"{self.spec.service_name} fetch error: {exc}", flush=True)
                await asyncio.sleep(1)
                continue

            for message in messages:
                try:
                    await processor.process(message)
                except Exception as exc:
                    print(f"{self.spec.service_name} processor error: {exc}", flush=True)
                    await message.nak(delay=self.spec.retry_policy.retry_delay_seconds)

        await self.bus.close()
