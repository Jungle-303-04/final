from __future__ import annotations

from packages.contracts.event_bus.subscriptions import (
    ALL_EVENTS_SUBJECT,
    WorkerSubscription,
)


class Settings:
    SERVICE_NAME = "audit-timeline-service"
    SUBSCRIPTION = WorkerSubscription(
        service_name=SERVICE_NAME,
        subject=ALL_EVENTS_SUBJECT,
    )
