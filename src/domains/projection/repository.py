"""projection 도메인 repository — 대시보드 read model."""

from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.projection.models import DashboardCard
from packages.config.settings import now_iso
from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.storage.engine import DASHBOARD_LIMIT, DatabaseConnection, row_dict


class DashboardRepository(DatabaseConnection):
    def upsert_dashboard(self, evt: EventEnvelope, status: str, summary: str) -> None:
        workspace_id = workspace_id_from_payload(evt.payload)
        card_id = f"{workspace_id}:{evt.correlation_id}"
        payload = {
            "last_event_id": evt.event_id,
            "correlation_id": evt.correlation_id,
            "last_source": evt.source,
            "last_payload": evt.payload,
            "updated_at": now_iso(),
        }
        table = DashboardCard.__table__
        insert_statement = pg_insert(table).values(
            correlation_id=card_id,
            workspace_id=workspace_id,
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
                "workspace_id": insert_statement.excluded.workspace_id,
                "summary": insert_statement.excluded.summary,
                "last_event": insert_statement.excluded.last_event,
                "payload": insert_statement.excluded.payload,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)

    def list_dashboard(self, workspace_id: str) -> list[JsonObject]:
        table = DashboardCard.__table__
        statement = (
            select(table)
            .where(table.c.workspace_id == workspace_id)
            .order_by(table.c.updated_at.desc())
            .limit(DASHBOARD_LIMIT)
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [row_dict(row) for row in rows]


def workspace_id_from_payload(payload: JsonObject) -> str:
    direct = payload.get("workspace_id")
    if direct:
        return str(direct)
    for key in ("plan", "evidence", "requested", "diff", "next_command", "result"):
        nested = payload.get(key)
        if isinstance(nested, Mapping) and nested.get("workspace_id"):
            return str(nested["workspace_id"])
    return DEFAULT_WORKSPACE_ID
