from __future__ import annotations

from rca_worker import RcaWorkflow

from packages.shared.constants import EventSubject
from packages.worker_runtime import WorkerRuntime

SERVICE_NAME = "rca-worker"
SUBSCRIBE_SUBJECT = EventSubject.CLUSTER_EVIDENCE_RECEIVED


async def run() -> None:
    await WorkerRuntime(
        SERVICE_NAME,
        SUBSCRIBE_SUBJECT,
        lambda bus, db: RcaWorkflow(bus, db, db, db).handle,
    ).run()
