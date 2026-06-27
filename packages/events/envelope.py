from __future__ import annotations

import uuid

from packages.config.time import now_iso
from packages.contracts.event_bus.fields import CAUSATION_ID, CORRELATION_ID
from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject

ROOT_CAUSATION_ID = None


def event(
    subject: str,
    source: str,
    payload: JsonObject,
    correlation_id: str | None = None,
    causation_id: str | None = None,
) -> EventEnvelope:
    event_id = str(uuid.uuid4())
    return EventEnvelope(
        event_id=event_id,
        subject=subject,
        source=source,
        correlation_id=(
            correlation_id or payload.get(CORRELATION_ID) or event_id
        ),
        causation_id=(
            causation_id or payload.get(CAUSATION_ID) or ROOT_CAUSATION_ID
        ),
        created_at=now_iso(),
        payload=payload,
    )
