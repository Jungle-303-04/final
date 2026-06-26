from __future__ import annotations

from audit_timeline import AuditTimelineWorkflow

from packages.worker_runtime import EventHandlerSpec, WorkerRuntime

SERVICE_NAME = "audit-timeline-service"
SUBSCRIBE_SUBJECT = ">"


async def run() -> None:
    spec = EventHandlerSpec(
        service_name=SERVICE_NAME,
        subject=SUBSCRIBE_SUBJECT,
        handler_factory=lambda events, db: AuditTimelineWorkflow(events, db).handle,
    )
    await WorkerRuntime(spec).run()
