from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

from packages.config.constants import Nats, Runtime
from packages.config.logs import get_logger
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import (
    EventBus,
    EventClient,
    EventEnvelope,
    EventPublisher,
    EventRecorder,
    EventSubscription,
    JsonObject,
)
from packages.contracts.event_bus.subjects import (
    STREAM_NAME,
    STREAM_SUBJECTS,
    EventSubject,
)
from packages.contracts.interfaces import DeadLetterStore
from packages.events.envelope import event

NATS_URL_ENV = "NATS_URL"
DEPENDENCY_RETRY_LIMIT = 60
DEPENDENCY_RETRY_DELAY_SECONDS = 2
logger = get_logger("event_bus")
CURRENT_CAUSATION_ID: ContextVar[str | None] = ContextVar(
    "current_event_causation_id",
    default=None,
)


def nats_client() -> Any:
    import nats
    return nats


def nats_not_found_error() -> type[Exception]:
    from nats.js.errors import NotFoundError
    return NotFoundError


def event_context(evt: EventEnvelope) -> dict[str, str | None]:
    """로그에 실을 표준 이벤트 식별 필드(흐름 추적용)."""
    return {
        "subject": evt.subject,
        "event_id": evt.event_id,
        "correlation_id": evt.correlation_id,
        "causation_id": evt.causation_id,
        "source": evt.source,
    }


@contextmanager
def event_causation(causation_id: str) -> Iterator[None]:
    token = CURRENT_CAUSATION_ID.set(causation_id)
    try:
        yield
    finally:
        CURRENT_CAUSATION_ID.reset(token)


class NatsEventBus(EventBus):
    def __init__(self) -> None:
        self.url = env(NATS_URL_ENV, Nats.DEFAULT_URL)
        self.nc = None
        self.js = None

    async def connect(self) -> None:
        nats = nats_client()
        for attempt in range(DEPENDENCY_RETRY_LIMIT):
            try:
                self.nc = await nats.connect(
                    self.url,
                    name=env(
                        Runtime.SERVICE_NAME_ENV, Runtime.DEFAULT_SERVICE_NAME
                    ),
                )
                self.js = self.nc.jetstream()
                await self.ensure_stream()
                return
            except Exception as exc:
                message = (
                    f"waiting for nats "
                    f"({attempt + 1}/{DEPENDENCY_RETRY_LIMIT}): {exc}"
                )
                print(
                    message,
                    flush=True,
                )
                await asyncio.sleep(DEPENDENCY_RETRY_DELAY_SECONDS)
        raise RuntimeError("NATS is not available")

    async def ensure_stream(self) -> None:
        assert self.js is not None
        not_found = nats_not_found_error()
        try:
            info = await self.js.stream_info(STREAM_NAME)
            subjects = sorted(
                set(info.config.subjects or []) | set(STREAM_SUBJECTS)
            )
            await self.js.update_stream(
                name=STREAM_NAME, subjects=subjects, storage="file"
            )
        except not_found:
            await self.js.add_stream(
                name=STREAM_NAME, subjects=STREAM_SUBJECTS, storage="file"
            )

    async def emit(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> EventEnvelope:
        assert self.js is not None
        evt = event(subject, source, payload, correlation_id, causation_id)
        await self.js.publish(subject, json.dumps(evt.to_dict()).encode())
        logger.info("emitted", extra={"context": event_context(evt)})
        return evt

    async def subscribe(self, subject: str, durable: str) -> EventSubscription:
        assert self.js is not None
        return await self.js.pull_subscribe(
            subject, durable=durable, stream=STREAM_NAME
        )

    async def close(self) -> None:
        if self.nc:
            await self.nc.drain()


class RecordedEventClient:
    def __init__(
        self, publisher: EventPublisher, recorder: EventRecorder
    ) -> None:
        self.publisher = publisher
        self.recorder = recorder

    async def emit(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> EventEnvelope:
        evt = await self.publisher.emit(
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
        evt: EventEnvelope,
        consumer: str,
        error: Exception,
        attempts: int,
    ) -> EventEnvelope:
        dead_letter = self.store.record_dead_letter(
            evt, consumer, str(error), attempts
        )
        return await self.events.emit(
            EventSubject.DEAD_LETTER_CREATED,
            self.source,
            dead_letter,
            evt.correlation_id,
            evt.event_id,
        )


async def emit_and_record(
    bus: EventPublisher,
    db: EventRecorder,
    subject: str,
    source: str,
    payload: JsonObject,
    correlation_id: str | None = None,
    causation_id: str | None = None,
) -> EventEnvelope:
    return await RecordedEventClient(bus, db).emit(
        subject,
        source,
        payload,
        correlation_id,
        causation_id,
    )
