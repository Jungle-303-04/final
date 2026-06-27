from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol, TypedDict

from packages.contracts.event_bus.fields import (
    CAUSATION_ID,
    CORRELATION_ID,
    CREATED_AT,
    EVENT_ID,
    PAYLOAD,
    SOURCE,
    SUBJECT,
)

JsonObject = dict[str, Any]


class Event(TypedDict):
    event_id: str
    subject: str
    source: str
    correlation_id: str
    causation_id: str | None
    created_at: str
    payload: JsonObject


@dataclass(frozen=True)
class EventEnvelope:
    event_id: str
    subject: str
    source: str
    correlation_id: str
    causation_id: str | None
    created_at: str
    payload: JsonObject

    @classmethod
    def from_mapping(cls, raw: Mapping[str, Any]) -> EventEnvelope:
        return cls(
            event_id=raw[EVENT_ID],
            subject=raw[SUBJECT],
            source=raw[SOURCE],
            correlation_id=raw[CORRELATION_ID],
            causation_id=raw.get(CAUSATION_ID),
            created_at=raw[CREATED_AT],
            payload=raw[PAYLOAD],
        )

    def to_dict(self) -> Event:
        return {
            EVENT_ID: self.event_id,
            SUBJECT: self.subject,
            SOURCE: self.source,
            CORRELATION_ID: self.correlation_id,
            CAUSATION_ID: self.causation_id,
            CREATED_AT: self.created_at,
            PAYLOAD: self.payload,
        }


EventHandler = Callable[[EventEnvelope], Awaitable[None]]


class HandlesEvent(Protocol):
    async def handle(self, evt: EventEnvelope) -> None: ...


class EventMessage(Protocol):
    data: bytes

    async def ack(self) -> None: ...

    async def nak(self, delay: int = 0) -> None: ...


class EventSubscription(Protocol):
    async def fetch(
        self, batch: int, timeout: float | None = None
    ) -> Sequence[EventMessage]: ...


class EventPublisher(Protocol):
    async def publish(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> EventEnvelope: ...


class EventRecorder(Protocol):
    def record_event(self, evt: EventEnvelope) -> None: ...


class EventClient(Protocol):
    async def publish(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> EventEnvelope: ...


class EventConsumerBus(EventPublisher, Protocol):
    async def connect(self) -> None: ...

    async def subscribe(
        self, subject: str, durable: str
    ) -> EventSubscription: ...

    async def close(self) -> None: ...


class EventBus(EventConsumerBus, Protocol):
    pass
