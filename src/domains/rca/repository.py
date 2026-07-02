"""rca 도메인 repository — 증거·RCA 리포트 영속."""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.rca.models import Evidence, RcaReport
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import DatabaseConnection


class RcaRepository(DatabaseConnection):
    def save_evidence(
        self, correlation_id: str, workspace_id: str, kind: str, body: JsonObject
    ) -> None:
        table = Evidence.__table__
        statement = pg_insert(table).values(
            workspace_id=workspace_id,
            correlation_id=correlation_id,
            kind=kind,
            payload=body,
        )
        with self.connection() as conn:
            conn.execute(statement)

    def save_rca_report(
        self,
        correlation_id: str,
        workspace_id: str,
        root_cause: str,
        action: str,
        body: JsonObject,
    ) -> None:
        table = RcaReport.__table__
        statement = pg_insert(table).values(
            workspace_id=workspace_id,
            correlation_id=correlation_id,
            root_cause=root_cause,
            action=action,
            payload=body,
        )
        with self.connection() as conn:
            conn.execute(statement)
