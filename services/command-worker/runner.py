from __future__ import annotations

from command_worker import CommandWorkflow

from packages.shared.constants import EventSubject
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
