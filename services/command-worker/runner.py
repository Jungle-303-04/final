from __future__ import annotations

from command_worker import CommandWorkflow
from settings import SUBSCRIPTION

from packages.runtime.service import WorkerService


def main() -> None:
    WorkerService.from_subscription(
        SUBSCRIPTION,
        lambda events, db: CommandWorkflow(events, db).handle,
    ).run()


if __name__ == "__main__":
    main()
