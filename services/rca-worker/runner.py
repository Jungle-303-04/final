from __future__ import annotations

from rca_worker import RcaWorkflow
from settings import SUBSCRIPTION

from packages.runtime.service import WorkerService


def main() -> None:
    WorkerService.from_subscription(
        SUBSCRIPTION,
        lambda events, db: RcaWorkflow(events, db, db).handle,
    ).run()


if __name__ == "__main__":
    main()
