from __future__ import annotations

from rca_worker import RcaWorkflow

from packages.shared.constants import EventSubject
from packages.worker_runtime import EventHandlerSpec, WorkerRuntime

SERVICE_NAME = "rca-worker"
SUBSCRIBE_SUBJECT = EventSubject.CLUSTER_EVIDENCE_RECEIVED


async def run() -> None:
    spec = EventHandlerSpec(
        service_name=SERVICE_NAME,
        subject=SUBSCRIBE_SUBJECT,
        handler_factory=lambda events, db: RcaWorkflow(events, db, db).handle,
    )
    await WorkerRuntime(spec).run()
