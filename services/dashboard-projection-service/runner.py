from __future__ import annotations

from dashboard_projection import DashboardProjectionWorkflow
from settings import SUBSCRIPTION

from packages.runtime.service import WorkerService


def main() -> None:
    WorkerService.from_subscription(
        SUBSCRIPTION,
        lambda events, db: DashboardProjectionWorkflow(events, db).handle,
    ).run()


if __name__ == "__main__":
    main()
