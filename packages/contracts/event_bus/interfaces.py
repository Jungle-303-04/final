from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from typing import Any, Protocol, TypedDict

JsonObject = dict[str, Any]


class Event(TypedDict):
    event_id: str
    subject: str
    source: str
    correlation_id: str
    causation_id: str | None
    created_at: str
    payload: JsonObject


EventHandler = Callable[[Event], Awaitable[None]]


class HandlesEvent(Protocol):
    async def handle(self, evt: Event) -> None: ...


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
    ) -> Event: ...


class EventRecorder(Protocol):
    def record_event(self, evt: Event) -> None: ...


class EventClient(Protocol):
    async def publish(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> Event: ...


class EventConsumerBus(EventPublisher, Protocol):
    async def connect(self) -> None: ...

    async def subscribe(
        self, subject: str, durable: str
    ) -> EventSubscription: ...

    async def close(self) -> None: ...


class EventBus(EventConsumerBus, Protocol):
    pass
