from __future__ import annotations

import uuid

from packages.config.time import now_iso
from packages.contracts.event_bus.interfaces import Event, JsonObject


def event(
    subject: str,
    source: str,
    payload: JsonObject,
    correlation_id: str | None = None,
) -> Event:
    return {
        "event_id": str(uuid.uuid4()),
        "subject": subject,
        "source": source,
        "correlation_id": correlation_id or payload.get("correlation_id") or str(uuid.uuid4()),
        "timestamp": now_iso(),
        "payload": payload,
    }
