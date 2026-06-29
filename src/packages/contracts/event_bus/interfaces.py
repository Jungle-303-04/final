from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, fields
from typing import Any, Protocol, TypedDict, cast

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
    """이벤트 봉투 — 공통 메타데이터 + payload. 속성으로 접근(evt.subject)."""

    event_id: str  # 이 이벤트의 고유 ID
    subject: str  # 주제(주소) — 예: git.changed
    source: str  # 발행한 서비스 이름
    correlation_id: str  # 같은 흐름(요청)의 이벤트를 묶는 ID
    causation_id: str | None  # 나를 유발한 직전 이벤트 ID(없으면 흐름 시작점)
    created_at: str  # 생성 시각(ISO 문자열)
    payload: JsonObject  # 본문 데이터(dict)

    # 필드 이름 단일 출처 = 이 dataclass. 직렬화도 여기서 파생.
    @classmethod
    def from_mapping(cls, raw: Mapping[str, Any]) -> EventEnvelope:
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in raw.items() if k in known})

    def to_dict(self) -> Event:
        data = {f.name: getattr(self, f.name) for f in fields(self)}
        return cast(Event, data)


# 워커가 구독한 이벤트 1건을 처리하는 함수 시그니처.
EventHandler = Callable[[EventEnvelope], Awaitable[list[EventEnvelope]]]


class EventMessage(Protocol):
    """브로커 메시지. ack=성공 확인, nak=재시도 요청."""

    data: bytes

    async def ack(self) -> None: ...

    async def nak(self, delay: int = 0) -> None: ...


class EventSubscription(Protocol):
    """pull 구독. fetch로 메시지를 배치로 당겨온다."""

    async def fetch(self, batch: int, timeout: float | None = None) -> Sequence[EventMessage]: ...


class EventPublisher(Protocol):
    async def emit(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> EventEnvelope: ...


class EnvelopePublisher(Protocol):
    async def publish_envelope(self, evt: EventEnvelope) -> EventEnvelope: ...


class EventRecorder(Protocol):
    # 발행한 이벤트를 영속 저장(감사/재생용).
    def record_event(self, evt: EventEnvelope) -> None: ...


class EventClient(Protocol):
    # emit = 브로커 발행 + 저장 + causation 자동 연결(RecordedEventClient).
    async def emit(
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

    async def subscribe(self, subject: str, durable: str) -> EventSubscription: ...

    async def close(self) -> None: ...


class EventBus(EventConsumerBus, Protocol):
    # 구체 구현 = NatsEventBus. 서비스는 이 Protocol 에만 의존.
    pass
