from __future__ import annotations

from dashboard_projection import DashboardProjectionWorkflow

from packages.worker_runtime import WorkerRuntime

SERVICE_NAME = "dashboard-projection-service"
SUBSCRIBE_SUBJECT = ">"


async def run() -> None:
    await WorkerRuntime(
        SERVICE_NAME,
        SUBSCRIBE_SUBJECT,
        lambda bus, db: DashboardProjectionWorkflow(bus, db, db).handle,
    ).run()
