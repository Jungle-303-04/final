from __future__ import annotations

from gitops_sync import GitOpsSyncWorkflow

from packages.config.constants import EventSubject
from packages.runtime.service import WorkerService

SERVICE_NAME = "gitops-sync-worker"
SUBSCRIBE_SUBJECT = EventSubject.GIT_WEBHOOK_RECEIVED


def main() -> None:
    WorkerService(
        SERVICE_NAME,
        SUBSCRIBE_SUBJECT,
        lambda events, db: GitOpsSyncWorkflow(events, db).handle,
    ).run()


if __name__ == "__main__":
    main()
