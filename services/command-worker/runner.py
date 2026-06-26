from __future__ import annotations

from command_worker import CommandWorkflow

from packages.config.constants import EventSubject
from packages.runtime.service import WorkerService

SERVICE_NAME = "command-worker"
SUBSCRIBE_SUBJECT = EventSubject.COMMAND_REQUESTED


def main() -> None:
    WorkerService(
        SERVICE_NAME,
        SUBSCRIBE_SUBJECT,
        lambda events, db: CommandWorkflow(events, db).handle,
    ).run()


if __name__ == "__main__":
    main()
