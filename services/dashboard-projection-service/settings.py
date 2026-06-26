from __future__ import annotations

from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.event_bus.subscriptions import ALL_EVENTS_SUBJECT, WorkerSubscription


class Settings:
    SERVICE_NAME = "dashboard-projection-service"
    SUBSCRIPTION = WorkerSubscription(
        service_name=SERVICE_NAME,
        subject=ALL_EVENTS_SUBJECT,
    )

    TERMINAL_SUCCESS_SUBJECTS = {EventSubject.SAFE_PR_CREATED, EventSubject.COMMAND_COMPLETED}
    REJECTED_SUBJECT_SUFFIX = "rejected"
    FAILED_SUBJECT_SUFFIX = "failed"
