from __future__ import annotations

from rca_worker import RcaWorkflow

from packages.config.constants import EventSubject
from packages.runtime.service import WorkerService

SERVICE_NAME = "rca-worker"
SUBSCRIBE_SUBJECT = EventSubject.CLUSTER_EVIDENCE_RECEIVED


def main() -> None:
    WorkerService(
        SERVICE_NAME,
        SUBSCRIBE_SUBJECT,
        lambda events, db: RcaWorkflow(events, db, db).handle,
    ).run()


if __name__ == "__main__":
    main()
