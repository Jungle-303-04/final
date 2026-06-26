from __future__ import annotations

from audit_timeline import AuditTimelineWorkflow
from settings import SERVICE_NAME, SUBSCRIBE_SUBJECT

from packages.runtime.service import WorkerService


def main() -> None:
    WorkerService(
        SERVICE_NAME,
        SUBSCRIBE_SUBJECT,
        lambda events, db: AuditTimelineWorkflow(events, db).handle,
    ).run()


if __name__ == "__main__":
    main()
