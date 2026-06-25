from __future__ import annotations

from gitops_sync import GitOpsSyncWorkflow

from packages.shared.constants import EventSubject
from packages.worker_runtime import WorkerRuntime

SERVICE_NAME = "gitops-sync-worker"
SUBSCRIBE_SUBJECT = EventSubject.GIT_WEBHOOK_RECEIVED


async def run() -> None:
    await WorkerRuntime(
        SERVICE_NAME,
        SUBSCRIBE_SUBJECT,
        lambda bus, db: GitOpsSyncWorkflow(bus, db).handle,
    ).run()
