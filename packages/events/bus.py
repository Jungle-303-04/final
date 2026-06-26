from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

import nats
from nats.js.errors import NotFoundError

from packages.config.constants import Nats, Runtime
from packages.config.settings import env
from packages.contracts.event_bus.fields import CORRELATION_ID, EVENT_ID
from packages.contracts.event_bus.interfaces import (
    Event,
    EventClient,
    EventPublisher,
    EventRecorder,
    EventSubscription,
    JsonObject,
)
from packages.contracts.event_bus.subjects import STREAM_NAME, STREAM_SUBJECTS, EventSubject
from packages.contracts.interfaces import DeadLetterStore
from packages.events.envelope import event

NATS_URL_ENV = "NATS_URL"
DEPENDENCY_RETRY_LIMIT = 60
DEPENDENCY_RETRY_DELAY_SECONDS = 2
CURRENT_CAUSATION_ID: ContextVar[str | None] = ContextVar(
    "current_event_causation_id",
    default=None,
)


@contextmanager
def event_causation(causation_id: str) -> Iterator[None]:
    token = CURRENT_CAUSATION_ID.set(causation_id)
    try:
        yield
    finally:
        CURRENT_CAUSATION_ID.reset(token)


class EventBus:
    def __init__(self) -> None:
        self.url = env(NATS_URL_ENV, Nats.DEFAULT_URL)
        self.nc = None
        self.js = None

    async def connect(self) -> None:
        for attempt in range(DEPENDENCY_RETRY_LIMIT):
            try:
                self.nc = await nats.connect(
                    self.url,
                    name=env(Runtime.SERVICE_NAME_ENV, Runtime.DEFAULT_SERVICE_NAME),
                )
                self.js = self.nc.jetstream()
                await self.ensure_stream()
                return
            except Exception as exc:
                print(
                    f"waiting for nats ({attempt + 1}/{DEPENDENCY_RETRY_LIMIT}): {exc}",
                    flush=True,
                )
                await asyncio.sleep(DEPENDENCY_RETRY_DELAY_SECONDS)
        raise RuntimeError("NATS is not available")

    async def ensure_stream(self) -> None:
        assert self.js is not None
        try:
            info = await self.js.stream_info(STREAM_NAME)
            subjects = sorted(set(info.config.subjects or []) | set(STREAM_SUBJECTS))
            await self.js.update_stream(name=STREAM_NAME, subjects=subjects, storage="file")
        except NotFoundError:
            await self.js.add_stream(name=STREAM_NAME, subjects=STREAM_SUBJECTS, storage="file")

    async def publish(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> Event:
        assert self.js is not None
        evt = event(subject, source, payload, correlation_id, causation_id)
        await self.js.publish(subject, json.dumps(evt).encode())
        print(f"published {subject} correlation={evt[CORRELATION_ID]}", flush=True)
        return evt

    async def subscribe(self, subject: str, durable: str) -> EventSubscription:
        assert self.js is not None
        return await self.js.pull_subscribe(subject, durable=durable, stream=STREAM_NAME)

    async def close(self) -> None:
        if self.nc:
            await self.nc.drain()


class RecordedEventClient:
    def __init__(self, publisher: EventPublisher, recorder: EventRecorder) -> None:
        self.publisher = publisher
        self.recorder = recorder

    async def publish(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> Event:
        evt = await self.publisher.publish(
            subject,
            source,
            payload,
            correlation_id,
            causation_id or CURRENT_CAUSATION_ID.get(),
        )
        self.recorder.record_event(evt)
        return evt


class DeadLetterSink:
    def __init__(
        self,
        events: EventClient,
        store: DeadLetterStore,
        source: str,
    ) -> None:
        self.events = events
        self.store = store
        self.source = source

    async def capture(
        self,
        evt: Event,
        consumer: str,
        error: Exception,
        attempts: int,
    ) -> Event:
        dead_letter = self.store.record_dead_letter(evt, consumer, str(error), attempts)
        return await self.events.publish(
            EventSubject.DEAD_LETTER_CREATED,
            self.source,
            dead_letter,
            evt[CORRELATION_ID],
            evt[EVENT_ID],
        )


async def publish_and_record(
    bus: EventPublisher,
    db: EventRecorder,
    subject: str,
    source: str,
    payload: JsonObject,
    correlation_id: str | None = None,
    causation_id: str | None = None,
) -> Event:
    return await RecordedEventClient(bus, db).publish(
        subject,
        source,
        payload,
        correlation_id,
        causation_id,
    )
