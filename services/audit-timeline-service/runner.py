from __future__ import annotations

from audit_timeline import AuditTimelineWorkflow

from packages.worker_runtime import WorkerRuntime

SERVICE_NAME = "audit-timeline-service"
SUBSCRIBE_SUBJECT = ">"


async def run() -> None:
    await WorkerRuntime(
        SERVICE_NAME,
        SUBSCRIBE_SUBJECT,
        lambda bus, db: AuditTimelineWorkflow(bus, db).handle,
    ).run()
