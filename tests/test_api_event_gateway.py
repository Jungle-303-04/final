from __future__ import annotations

import asyncio

from packages.contracts.auth import Actor
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.subjects import EventSubject
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
