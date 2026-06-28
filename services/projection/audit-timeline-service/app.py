from __future__ import annotations

from audit_timeline import AuditTimelineWorkflow
from settings import Settings

from packages.runtime.service import WorkerService


def main() -> None:
    WorkerService.from_subscription(
        Settings.SUBSCRIPTION,
        lambda events, db: AuditTimelineWorkflow(events, db).handle,
    ).run()


if __name__ == "__main__":
    main()
