"""이벤트 핸들러 실행 기계장치(런타임).

registry(카탈로그, "어떤 이벤트가 있나")와 분리. 여기는 런타임 —
"이벤트를 받아 body 로 디코드 → 핸들러 실행 → yield 된 다음 이벤트 발행".
App.run 이 NATS 루프(WorkerRuntime)에 연결.
"""

from __future__ import annotations

import inspect
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.registry import Subscription


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


async def _iter_results(result: Any) -> AsyncIterator[Any]:
    """핸들러 결과를 body 스트림으로 통일: yield형 / list / 단건 / None."""
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


async def _emit_results(client: Any, source: str, evt: EventEnvelope, result: Any) -> None:
    """핸들러가 yield 한 body 들을 다음 이벤트로 발행(공통)."""
    async for out in _iter_results(result):
        # causation 은 EventProcessor 가 contextvar 로 자동 연결.
        await client.emit(out.__subject__, source, out.to_body(), evt.correlation_id)


def make_event_handler(sub: Subscription, client: Any, db: Any, source: str) -> Callable[[EventEnvelope], Any]:
    """타입 구독: 봉투 → body 디코드 → 콜백 → yield된 body 발행."""

    async def handle(evt: EventEnvelope) -> None:
        body = sub.body_type.from_body(evt.payload)
        ctx = EventContext.of(evt, db)
        result = sub.fn(body, ctx) if sub.wants_ctx else sub.fn(body)
        await _emit_results(client, source, evt, result)

    return handle


def make_raw_handler(fn: Callable[..., Any], wants_ctx: bool, client: Any, db: Any, source: str) -> Callable[[EventEnvelope], Any]:
    """전체(>) 구독: 디코드 없이 봉투 그대로 → 콜백 → yield된 body 발행."""

    async def handle(evt: EventEnvelope) -> None:
        ctx = EventContext.of(evt, db)
        result = fn(evt, ctx) if wants_ctx else fn(evt)
        await _emit_results(client, source, evt, result)

    return handle
