from __future__ import annotations

import asyncio
from contextlib import contextmanager
from typing import Any

from packages.contracts.auth import Actor
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.subjects import EventSubject
from packages.events.bus import NATS_MSG_ID_HEADER, NatsEventBus
from packages.events.envelope import event
from packages.runtime.gateway import ApiEventGateway


class MemoryPublisher:
    def __init__(self) -> None:
        self.events: list[EventEnvelope] = []

    async def emit(
        self,
        subject: str,
        source: str,
        payload: dict[str, object],
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> EventEnvelope:
        evt = event(subject, source, payload, correlation_id, causation_id)
        self.events.append(evt)
        return evt


class MemoryRecorder:
    def __init__(self) -> None:
        self.events: list[EventEnvelope] = []

    def record_event(self, evt: EventEnvelope) -> None:
        self.events.append(evt)


class DurableRecorder(MemoryRecorder):
    def __init__(self) -> None:
        super().__init__()
        self.staged: list[EventEnvelope] = []

    @contextmanager
    def unit_of_work(self):
        yield object()

    def stage_events(self, _conn: Any, events: list[EventEnvelope]) -> None:
        self.staged.extend(events)


def test_api_event_gateway_attaches_actor_and_records_event() -> None:
    async def run() -> None:
        publisher = MemoryPublisher()
        recorder = MemoryRecorder()
        gateway = ApiEventGateway(publisher, recorder, "api-gateway")
        actor = Actor("user-1", roles=("operator",))

        accepted = await gateway.accept(
            EventSubject.COMMAND_REQUESTED, {"action": "rollout_restart"}, actor=actor
        )

        assert accepted.response()["accepted"] is True
        assert publisher.events == [accepted.event]
        assert recorder.events == [accepted.event]
        assert accepted.event.payload["requested_by"] == "user-1"
        assert accepted.event.payload["actor"] == actor.to_body()

    asyncio.run(run())


def test_api_event_gateway_stages_supported_recorder_without_direct_publish() -> None:
    async def run() -> None:
        publisher = MemoryPublisher()
        recorder = DurableRecorder()
        gateway = ApiEventGateway(publisher, recorder, "api-gateway")

        accepted = await gateway.accept(EventSubject.AGENT_CONNECTED, {"cluster_id": "c1"})

        assert publisher.events == []
        assert recorder.events == [accepted.event]
        assert recorder.staged == [accepted.event]

    asyncio.run(run())


def test_nats_publish_uses_event_id_as_message_id_header() -> None:
    async def run() -> None:
        class FakeJetStream:
            def __init__(self) -> None:
                self.published: list[dict[str, object]] = []

            async def publish(
                self,
                subject: str,
                payload: bytes,
                headers: dict[str, object] | None = None,
            ) -> None:
                self.published.append(
                    {"subject": subject, "payload": payload, "headers": headers or {}}
                )

        bus = NatsEventBus()
        fake_js = FakeJetStream()
        bus.js = fake_js
        evt = event("cluster.evidence.received", "api-gateway", {}, "corr-1")

        await bus.publish_envelope(evt)

        assert fake_js.published[0]["headers"][NATS_MSG_ID_HEADER] == evt.event_id

    asyncio.run(run())
