from __future__ import annotations

import uuid

from packages.config.time import now_iso
from packages.contracts.event_bus.fields import (
    CAUSATION_ID,
    CORRELATION_ID,
    CREATED_AT,
    EVENT_ID,
    PAYLOAD,
    SOURCE,
    SUBJECT,
)
from packages.contracts.event_bus.interfaces import Event, JsonObject

ROOT_CAUSATION_ID = None


def event(
    subject: str,
    source: str,
    payload: JsonObject,
    correlation_id: str | None = None,
    causation_id: str | None = None,
) -> Event:
    event_id = str(uuid.uuid4())
    return {
        EVENT_ID: event_id,
        SUBJECT: subject,
        SOURCE: source,
        CORRELATION_ID: correlation_id or payload.get(CORRELATION_ID) or event_id,
        CAUSATION_ID: causation_id or payload.get(CAUSATION_ID) or ROOT_CAUSATION_ID,
        CREATED_AT: now_iso(),
        PAYLOAD: payload,
    }
