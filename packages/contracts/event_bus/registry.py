"""이벤트 타입 레지스트리(전역 계약) + 핸들러 실행 도구.

- @events.reg(SUBJECT): 이 payload가 이 이벤트다(전역 이벤트 카탈로그).
- 실제 구독(@app.sub)과 실행(App.run)은 packages/runtime/app.py 의 App 이 한다.
  이벤트 "정의"는 공유 계약이라 전역, "핸들러"는 서비스별이라 App 소유.
"""

from __future__ import annotations

import inspect
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, fields
from typing import Any

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.subjects import EventSubject


@dataclass(frozen=True)
class EventContext:
    """핸들러가 받는 꾸러미: 흐름 정보 + 도구(db). 안 쓰면 생략 가능."""

    event_id: str
    subject: str
    correlation_id: str
    causation_id: str | None
    db: Any

    @classmethod
    def of(cls, evt: EventEnvelope, db: Any) -> EventContext:
        return cls(
            event_id=evt.event_id,
            subject=evt.subject,
            correlation_id=evt.correlation_id,
            causation_id=evt.causation_id,
            db=db,
        )


@dataclass(frozen=True)
class Subscription:
    subject: EventSubject
    payload_type: type
    fn: Callable[..., Any]
    wants_ctx: bool


class EventRegistry:
    """전역 이벤트 카탈로그(주소록). @events.reg 로 이벤트 타입이 적힌다."""

    def __init__(self) -> None:
        self._defs: dict[EventSubject, type] = {}
        self._handlers: dict[EventSubject, tuple[str, str]] = {}

    def reg(self, subject: EventSubject) -> Callable[[type], type]:
        def decorator(payload_type: type) -> type:
            payload_type.__subject__ = subject
            self._defs[subject] = payload_type
            return payload_type

        return decorator

    def note_handler(self, service: str, sub: Subscription) -> None:
        """App 이 자기 핸들러를 카탈로그에 알린다(make events 표시용)."""
        self._handlers[sub.subject] = (service, sub.fn.__name__)

    def describe(self) -> str:
        rows = ["EVENTS (한눈에 보기)", ""]
        for subject, payload_type in sorted(self._defs.items()):
            names = ", ".join(f.name for f in fields(payload_type))
            service, handler = self._handlers.get(subject, ("-", "-"))
            rows.append(
                f"{subject:<28} {payload_type.__name__:<26} "
                f"by={service}/{handler}  payload=({names})"
            )
        return "\n".join(rows)


events = EventRegistry()


def wants_ctx(fn: Callable[..., Any]) -> bool:
    """핸들러 시그니처 검증(import 시점 fail fast). (evt) 또는 (evt, ctx)."""
    params = [
        p
        for p in inspect.signature(fn).parameters.values()
        if p.name != "self"
    ]
    if not 1 <= len(params) <= 2:
        raise TypeError(
            f"{fn.__name__} 은 (evt) 또는 (evt, ctx) 형태여야 한다"
        )
    return len(params) == 2


async def _iter_results(result: Any) -> AsyncIterator[Any]:
    """핸들러 결과를 payload 스트림으로 통일: yield형 / list / 단건 / None."""
    if inspect.isasyncgen(result):
        async for item in result:
            yield item
        return
    value = await result
    if value is None:
        return
    if isinstance(value, list):
        for item in value:
            yield item
    else:
        yield value


def make_event_handler(
    sub: Subscription, client: Any, db: Any, source: str
) -> Callable[[EventEnvelope], Any]:
    """봉투 핸들러로 감싼다: 디코드 → 콜백 → yield된 payload 발행."""

    async def handle(evt: EventEnvelope) -> None:
        payload = sub.payload_type.from_payload(evt.payload)
        ctx = EventContext.of(evt, db)
        result = sub.fn(payload, ctx) if sub.wants_ctx else sub.fn(payload)
        async for out in _iter_results(result):
            # causation 은 EventProcessor 가 contextvar 로 자동 연결한다.
            await client.emit(
                out.__subject__, source, out.to_payload(), evt.correlation_id
            )

    return handle
