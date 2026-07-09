"""오류 경로 보강 — 미등록 subject 라우팅 거부 / relay 발행 실패 시 sent 미표시."""

from __future__ import annotations

import asyncio

import pytest

from packages.events.envelope import event
from packages.runtime.dispatch import make_router
from packages.runtime.relay import OutboxRelay


def test_router_rejects_unregistered_subject() -> None:
    async def run() -> None:
        router = make_router({})  # 구독 핸들러 없음
        with pytest.raises(RuntimeError):  # 미등록 subject → fail() → DLQ 경로
            await router(event("nope.subject", "src", {}, "c1"))

    asyncio.run(run())


class _StubOutboxStore:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def unsent_events(self, limit: int, source: str | None):
        return [event("a.b", source, {}, "c1")]

    async def mark_events_sent(self, event_ids: list[str]) -> None:
        self.sent.extend(event_ids)


class _BrokenPublisher:
    async def publish_envelope(self, evt):
        raise RuntimeError("nats down")


def test_relay_publish_failure_does_not_mark_sent() -> None:
    async def run() -> None:
        store = _StubOutboxStore()
        relay = OutboxRelay(store, _BrokenPublisher(), "svc")
        with pytest.raises(RuntimeError):  # 발행 예외가 mark_events_sent 전에 터짐
            await relay.run_once()
        assert store.sent == []  # sent 표시 안 됨 → 다음 루프에서 재발행(유실 없음)

    asyncio.run(run())
