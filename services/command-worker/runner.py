from __future__ import annotations

# ruff: noqa: E402
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from command_worker import CommandWorkflow

from packages.shared.constants import EventSubject
from packages.shared.service_bootstrap import run_service
from packages.worker_runtime import EventHandlerSpec, WorkerRuntime

SERVICE_NAME = "command-worker"
SUBSCRIBE_SUBJECT = EventSubject.COMMAND_REQUESTED


async def run() -> None:
    spec = EventHandlerSpec(
        service_name=SERVICE_NAME,
        subject=SUBSCRIBE_SUBJECT,
        handler_factory=lambda events, db: CommandWorkflow(events, db).handle,
    )
    await WorkerRuntime(spec).run()


def main() -> None:
    run_service(SERVICE_NAME, run)


if __name__ == "__main__":
    main()
