from __future__ import annotations

from gitops_sync import GitOpsSyncWorkflow

from packages.shared.constants import EventSubject
from packages.worker_runtime import EventHandlerSpec, WorkerRuntime

SERVICE_NAME = "gitops-sync-worker"
SUBSCRIBE_SUBJECT = EventSubject.GIT_WEBHOOK_RECEIVED


async def run() -> None:
    spec = EventHandlerSpec(
        service_name=SERVICE_NAME,
        subject=SUBSCRIBE_SUBJECT,
        handler_factory=lambda events, db: GitOpsSyncWorkflow(events, db).handle,
    )
    await WorkerRuntime(spec).run()
