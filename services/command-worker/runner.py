from __future__ import annotations

from command_worker import CommandWorkflow

from packages.shared.constants import EventSubject
from packages.worker_runtime import WorkerRuntime

SERVICE_NAME = "command-worker"
SUBSCRIBE_SUBJECT = EventSubject.COMMAND_REQUESTED


async def run() -> None:
    await WorkerRuntime(
        SERVICE_NAME,
        SUBSCRIBE_SUBJECT,
        lambda bus, db: CommandWorkflow(bus, db).handle,
    ).run()
