from __future__ import annotations

from gitops_sync import GitOpsSyncWorkflow
from settings import SUBSCRIPTION

from packages.runtime.service import WorkerService


def main() -> None:
    WorkerService.from_subscription(
        SUBSCRIPTION,
        lambda events, db: GitOpsSyncWorkflow(events, db).handle,
    ).run()


if __name__ == "__main__":
    main()
