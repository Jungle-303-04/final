"""OutboxRelay 단위 테스트 — fake outbox + fake publisher.

(DB 트랜잭션/실발행은 실DB 스모크 영역. 여기선 relay 로직만.)
"""

from __future__ import annotations

import asyncio

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.runtime.relay import OutboxRelay


def _evt(event_id: str) -> EventEnvelope:
    return EventEnvelope(
        event_id=event_id,
        subject="demo.ping.requested",
        source="api-gateway",
        correlation_id="corr-1",
        causation_id=None,
        created_at="t",
        payload={},
    )


class FakeOutboxStore:
    def __init__(self, events: list[EventEnvelope]) -> None:
        self.pending = list(events)
        self.sent: list[str] = []

    async def unsent_events(self, limit: int, source: str) -> list[EventEnvelope]:
        return [e for e in self.pending if e.source == source][:limit]

    async def mark_events_sent(self, event_ids: list[str]) -> None:
        self.sent.extend(event_ids)
        self.pending = [e for e in self.pending if e.event_id not in event_ids]


class FakePublisher:
    def __init__(self) -> None:
        self.published: list[str] = []

    async def publish_envelope(self, evt: EventEnvelope) -> EventEnvelope:
        self.published.append(evt.event_id)
        return evt


def test_relay_publishes_then_marks_sent() -> None:
    store = FakeOutboxStore([_evt("a"), _evt("b")])
    publisher = FakePublisher()
    relay = OutboxRelay(store, publisher, "api-gateway")

    sent = asyncio.run(relay.run_once())

    assert sent == 2
    assert publisher.published == ["a", "b"]  # 저장된 event_id 그대로 발행
    assert store.sent == ["a", "b"]


def test_relay_publishes_only_own_source() -> None:
    other = EventEnvelope(
        event_id="x",
        subject="demo.ping.requested",
        source="other-worker",
        correlation_id="corr-1",
        causation_id=None,
        created_at="t",
        payload={},
    )
    store = FakeOutboxStore([_evt("a"), other])
    publisher = FakePublisher()
    relay = OutboxRelay(store, publisher, "api-gateway")

    assert asyncio.run(relay.run_once()) == 1
    assert publisher.published == ["a"]  # 다른 워커(other-worker) 행은 건드리지 않음


def test_relay_idempotent_when_drained() -> None:
    store = FakeOutboxStore([_evt("a")])
    relay = OutboxRelay(store, FakePublisher(), "api-gateway")

    assert asyncio.run(relay.run_once()) == 1
    assert asyncio.run(relay.run_once()) == 0  # 비면 아무 것도 안 함
