from __future__ import annotations

from dataclasses import dataclass

from packages.config.errors import require
from packages.contracts.auth import Actor
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.event_bus.interfaces import (
    EventEnvelope,
    EventPublisher,
    EventRecorder,
    JsonObject,
)
from packages.contracts.gateway.fields import Gateway
from packages.events.bus import RecordedEventClient


@dataclass(frozen=True)
class AcceptedEvent:
    event: EventEnvelope

    def response(self, include_event: bool = False) -> JsonObject:
        data: JsonObject = {
            Gateway.ACCEPTED: True,
            Gateway.EVENT_ID: self.event.event_id,
            Gateway.CORRELATION_ID: self.event.correlation_id,
        }
        if include_event:
            data[Gateway.EVENT] = self.event
        return data


class ApiEventGateway:
    """HTTP/API 입력을 내부 event envelope로 바꾸는 표준 입구."""

    def __init__(self, publisher: EventPublisher, recorder: EventRecorder, source: str) -> None:
        self.events = RecordedEventClient(publisher, recorder)
        self.source = source

    async def accept(
        self,
        subject: str,
        payload: JsonObject,
        correlation_id: str | None = None,
        causation_id: str | None = None,
        actor: Actor | None = None,
    ) -> AcceptedEvent:
        event_payload = dict(payload)
        if actor is not None:
            event_payload.setdefault(Gateway.REQUESTED_BY, actor.user_id)
            if not event_payload.get(Gateway.ACTOR):
                event_payload[Gateway.ACTOR] = actor.to_body()
        evt = await self.events.emit(
            subject, self.source, event_payload, correlation_id, causation_id
        )
        return AcceptedEvent(evt)

    async def accept_body(
        self,
        body: EventBody,
        correlation_id: str | None = None,
        causation_id: str | None = None,
        actor: Actor | None = None,
    ) -> AcceptedEvent:
        subject = getattr(body, "__subject__", None)
        require(subject is not None, f"{body.__class__.__name__} 에 subject 없음", TypeError)
        return await self.accept(subject, body.to_body(), correlation_id, causation_id, actor)
