from __future__ import annotations

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.interfaces import AuditLogStore


class AuditTimelineWorkflow:
    def __init__(self, _bus: object, audit_log: AuditLogStore) -> None:
        self.audit_log = audit_log

    async def handle(self, evt: EventEnvelope) -> None:
        self.audit_log.append_audit_log(evt)
