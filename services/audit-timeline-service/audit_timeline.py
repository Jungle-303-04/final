from __future__ import annotations

from typing import Any

from packages.contracts.interfaces import AuditLogStore


class AuditTimelineWorkflow:
    def __init__(self, _bus: object, audit_log: AuditLogStore) -> None:
        self.audit_log = audit_log

    async def handle(self, evt: dict[str, Any]) -> None:
        self.audit_log.append_audit_log(evt)
