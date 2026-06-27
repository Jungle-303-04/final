from __future__ import annotations

import asyncio
import json
import signal
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from packages.contracts.event_bus.fields import EVENT_ID
from packages.contracts.event_bus.interfaces import (
    Event,
    EventClient,
    EventConsumerBus,
    EventHandler,
    EventMessage,
)
from packages.contracts.event_bus.processing import EventProcessingStatus
from packages.contracts.event_bus.subscriptions import durable_name
from packages.contracts.interfaces import EventProcessingStore
from packages.events.bus import (
    DeadLetterSink,
    NatsEventBus,
    RecordedEventClient,
    event_causation,
)
from packages.runtime.ledger import Ledger

if TYPE_CHECKING:
    from packages.storage.database import Database

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
        return durable_name(self.service_name, self.durable_name)


class Codec(Protocol):
    def decode(self, message: EventMessage) -> Event: ...


class JsonCodec:
    def decode(self, message: EventMessage) -> Event:
        return json.loads(message.data.decode())


class DeadLetterPort(Protocol):
    async def capture(
        self,
        evt: Event,
        consumer: str,
        error: Exception,
        attempts: int,
    ) -> Event: ...


class EventProcessor:
    def __init__(
        self,
        service_name: str,
        handler: EventHandler,
        store: EventProcessingStore,
        dead_letters: DeadLetterPort,
        retry_policy: EventRetryPolicy,
        codec: Codec | None = None,
        ledger: Ledger | None = None,
    ) -> None:
        self.service_name = service_name
        self.handler = handler
        self.dead_letters = dead_letters
        self.retry_policy = retry_policy
        self.codec = codec if codec is not None else JsonCodec()
        self.ledger = (
            ledger if ledger is not None else Ledger(store, service_name)
        )

    async def process(self, message: EventMessage) -> None:
        evt = self.codec.decode(message)
        processing = self.ledger.begin(evt)
        if processing["status"] != EventProcessingStatus.PROCESSING:
            await message.ack()
            return

        attempts = int(processing["attempts"])
        try:
            with event_causation(evt[EVENT_ID]):
                await self.handler(evt)
            self.ledger.finish(evt)
            await message.ack()
        except Exception as exc:
            await self.fail(message, evt, exc, attempts)

    async def fail(
        self,
        message: EventMessage,
        evt: Event,
        error: Exception,
        attempts: int,
    ) -> None:
        if attempts >= self.retry_policy.max_attempts:
            self.ledger.dead_letter(evt, error)
            await self.dead_letters.capture(
                evt, self.service_name, error, attempts
            )
            await message.ack()
            return

        self.ledger.retry(evt, error)
        await message.nak(delay=self.retry_policy.retry_delay_seconds)


class WorkerRuntime:
    def __init__(
        self,
        spec: EventHandlerSpec,
        bus: EventConsumerBus | None = None,
        db: Database | None = None,
    ) -> None:
        self.spec = spec
        if db is None:
            from packages.storage.database import Database

            db = Database()
        self.bus = bus if bus is not None else NatsEventBus()
        self.db = db

    async def run(self) -> None:
        from packages.storage.database import wait_for_database

        await wait_for_database(self.db)
        await self.bus.connect()
        sub = await self.bus.subscribe(
            self.spec.subject, durable=self.spec.durable
        )
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
        print(
            f"{self.spec.service_name} subscribed to {self.spec.subject}",
            flush=True,
        )

        while not stopping.is_set():
            try:
                messages = await sub.fetch(
                    self.spec.retry_policy.fetch_batch_size,
                    timeout=self.spec.retry_policy.fetch_timeout_seconds,
                )
            except TimeoutError:
                continue
            except Exception as exc:
                print(
                    f"{self.spec.service_name} fetch error: {exc}", flush=True
                )
                await asyncio.sleep(1)
                continue

            for message in messages:
                try:
                    await processor.process(message)
                except Exception as exc:
                    print(
                        f"{self.spec.service_name} processor error: {exc}",
                        flush=True,
                    )
                    await message.nak(
                        delay=self.spec.retry_policy.retry_delay_seconds
                    )

        await self.bus.close()
        dispose_async = getattr(self.db, "dispose_async", None)
        if dispose_async is not None:
            await dispose_async()
        dispose = getattr(self.db, "dispose", None)
        if dispose is not None:
            dispose()
