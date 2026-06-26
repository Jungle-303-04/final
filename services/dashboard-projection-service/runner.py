from __future__ import annotations

from dashboard_projection import DashboardProjectionWorkflow

from packages.worker_runtime import EventHandlerSpec, WorkerRuntime

SERVICE_NAME = "dashboard-projection-service"
SUBSCRIBE_SUBJECT = ">"


async def run() -> None:
    spec = EventHandlerSpec(
        service_name=SERVICE_NAME,
        subject=SUBSCRIBE_SUBJECT,
        handler_factory=lambda events, db: DashboardProjectionWorkflow(events, db).handle,
    )
    await WorkerRuntime(spec).run()
