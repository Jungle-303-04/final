from __future__ import annotations

from collections.abc import Callable

from service.shared.core import Database, EventBus
from service.workers.audit import AuditTimelineWorkflow
from service.workers.command import CommandWorkflow
from service.workers.dashboard import DashboardProjectionWorkflow
from service.workers.gitops import GitOpsSyncWorkflow
from service.workers.rca import RcaWorkflow
from service.workers.runtime import Handler

WORKERS: dict[str, tuple[str, Callable[[EventBus, Database], Handler]]] = {
    "gitops-sync-worker": (
        "git.webhook.received",
        lambda bus, db: GitOpsSyncWorkflow(bus, db).handle,
    ),
    "command-worker": ("command.requested", lambda bus, db: CommandWorkflow(bus, db).handle),
    "rca-worker": ("cluster.evidence.received", lambda bus, db: RcaWorkflow(bus, db).handle),
    "dashboard-projection-service": (
        ">",
        lambda bus, db: DashboardProjectionWorkflow(bus, db).handle,
    ),
    "audit-timeline-service": (">", lambda bus, db: AuditTimelineWorkflow(bus, db).handle),
}
