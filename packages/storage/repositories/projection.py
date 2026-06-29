from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from packages.config.settings import now_iso
from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.storage.engine import (
    DASHBOARD_LIMIT,
    DatabaseConnection,
    row_dict,
)
from packages.storage.schema import (
    AuditLog,
    DashboardCard,
)


class DashboardRepository(DatabaseConnection):
    def upsert_dashboard(self, evt: EventEnvelope, status: str, summary: str) -> None:
        payload = {
            "last_event_id": evt.event_id,
            "last_source": evt.source,
            "last_payload": evt.payload,
            "updated_at": now_iso(),
        }
        table = DashboardCard.__table__
        insert_statement = pg_insert(table).values(
            correlation_id=evt.correlation_id,
            status=status,
            summary=summary,
            last_event=evt.subject,
            payload=payload,
            updated_at=func.now(),
        )
        statement = insert_statement.on_conflict_do_update(
            index_elements=[table.c.correlation_id],
            set_={
                "status": insert_statement.excluded.status,
                "summary": insert_statement.excluded.summary,
                "last_event": insert_statement.excluded.last_event,
                "payload": insert_statement.excluded.payload,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)

    def list_dashboard(self) -> list[JsonObject]:
        table = DashboardCard.__table__
        statement = select(table).order_by(table.c.updated_at.desc()).limit(DASHBOARD_LIMIT)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [row_dict(row) for row in rows]


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
