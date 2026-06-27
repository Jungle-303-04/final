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
    """코드에서 다루는 이벤트 봉투. 속성으로 접근한다(evt.subject).

    봉투 = 모든 이벤트가 공통으로 갖는 메타데이터 + payload(본문).
    - correlation_id: 한 흐름(요청)에 속한 이벤트를 묶는 ID.
    - causation_id: 직전(나를 유발한) 이벤트의 ID. 인과 사슬 추적용.
    Event(TypedDict)는 와이어/저장용 dict, 변환은 from_mapping/to_dict.
    """

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


# 워커가 구독한 이벤트 1건을 처리하는 함수 시그니처.
EventHandler = Callable[[EventEnvelope], Awaitable[None]]


class HandlesEvent(Protocol):
    async def handle(self, evt: EventEnvelope) -> None: ...


class EventMessage(Protocol):
    """브로커 메시지. ack=성공 확인, nak=재시도 요청."""

    data: bytes

    async def ack(self) -> None: ...

    async def nak(self, delay: int = 0) -> None: ...


class EventSubscription(Protocol):
    """pull 구독. fetch로 메시지를 배치로 당겨온다."""

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
    # 발행한 이벤트를 영속 저장(감사/재생용).
    def record_event(self, evt: EventEnvelope) -> None: ...


class EventClient(Protocol):
    # publish = 브로커 발행 + 저장 + causation 자동 연결(RecordedEventClient).
    async def publish(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> EventEnvelope: ...


class EventConsumerBus(EventPublisher, Protocol):
    """발행 + 구독이 가능한 버스(워커가 사용)."""

    async def connect(self) -> None: ...

    async def subscribe(
        self, subject: str, durable: str
    ) -> EventSubscription: ...

    async def close(self) -> None: ...


class EventBus(EventConsumerBus, Protocol):
    # 구체 구현은 NatsEventBus. 서비스는 이 Protocol에만 의존한다.
    pass
