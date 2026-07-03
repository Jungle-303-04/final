"""rca 도메인 repository — 증거·RCA 리포트 영속."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.rca.models import Evidence, RcaBacklogItem, RcaReport
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

    def upsert_rca_backlog_item(self, body: JsonObject) -> None:
        table = RcaBacklogItem.__table__
        insert_statement = pg_insert(table).values(
            backlog_id=body["backlog_id"],
            workspace_id=body["workspace_id"],
            incident_id=body["incident_id"],
            symptom=body["symptom"],
            title=body["title"],
            reason=body["reason"],
            evidence_ref=body["evidence_ref"],
            missing_evidence={"items": body["missing_evidence"]},
            status=body["status"],
            occurrence_count=1,
            payload=body["payload"],
            updated_at=func.now(),
        )
        statement = insert_statement.on_conflict_do_update(
            index_elements=[table.c.backlog_id],
            set_={
                "incident_id": insert_statement.excluded.incident_id,
                "reason": insert_statement.excluded.reason,
                "evidence_ref": insert_statement.excluded.evidence_ref,
                "missing_evidence": insert_statement.excluded.missing_evidence,
                "status": insert_statement.excluded.status,
                "occurrence_count": table.c.occurrence_count + 1,
                "payload": insert_statement.excluded.payload,
                "updated_at": func.now(),
            },
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
