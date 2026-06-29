"""audit 도메인 repository — 불변 감사 로그."""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.audit.models import AuditLog
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.storage.engine import DatabaseConnection


class AuditLogRepository(DatabaseConnection):
    def append_audit_log(self, evt: EventEnvelope) -> None:
        table = AuditLog.__table__
        statement = pg_insert(table).values(
            event_id=evt.event_id,
            subject=evt.subject,
            source=evt.source,
            correlation_id=evt.correlation_id,
            payload=evt.payload,
        )
        with self.connection() as conn:
            conn.execute(statement)
