"""target 도메인 repository — agent lease와 evidence dedupe."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.target.models import EvidenceSourceLease, EvidenceWindow
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import DatabaseConnection, iso_or_none


class TargetAgentRepository(DatabaseConnection):
    def lease_evidence_source(
        self,
        cluster_id: str,
        workspace_id: str,
        source_id: str,
        agent_id: str,
        window_start: str,
        lease_seconds: int,
    ) -> JsonObject:
        table = EvidenceSourceLease.__table__
        lease_id = str(uuid.uuid4())
        leased_until = datetime.now(UTC) + timedelta(seconds=lease_seconds)
        statement = (
            pg_insert(table)
            .values(
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                source_id=source_id,
                agent_id=agent_id,
                lease_id=lease_id,
                window_start=window_start,
                leased_until=leased_until,
                updated_at=func.now(),
            )
            .on_conflict_do_update(
                index_elements=[table.c.workspace_id, table.c.cluster_id, table.c.source_id],
                set_={
                    "agent_id": agent_id,
                    "lease_id": lease_id,
                    "window_start": window_start,
                    "leased_until": leased_until,
                    "updated_at": func.now(),
                },
                where=or_(table.c.leased_until < func.now(), table.c.agent_id == agent_id),
            )
            .returning(table.c.lease_id, table.c.leased_until)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
            if row:
                return {
                    "leased": True,
                    "lease_id": row["lease_id"],
                    "leased_until": iso_or_none(row["leased_until"]),
                }
            existing = (
                conn.execute(
                    select(table.c.lease_id, table.c.leased_until).where(
                        table.c.workspace_id == workspace_id,
                        table.c.cluster_id == cluster_id,
                        table.c.source_id == source_id,
                    )
                )
                .mappings()
                .first()
            )
        return {
            "leased": False,
            "lease_id": existing["lease_id"] if existing else None,
            "leased_until": iso_or_none(existing["leased_until"]) if existing else None,
        }

    def get_evidence_window(self, evidence_key: str) -> JsonObject | None:
        table = EvidenceWindow.__table__
        statement = select(table.c.event_id, table.c.correlation_id).where(
            table.c.evidence_key == evidence_key
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row else None

    def record_evidence_window(
        self,
        evidence_key: str,
        workspace_id: str,
        cluster_id: str,
        source_id: str,
        window_start: str,
        agent_id: str | None,
        event_id: str,
        correlation_id: str,
        payload: JsonObject,
    ) -> JsonObject:
        table = EvidenceWindow.__table__
        statement = (
            pg_insert(table)
            .values(
                evidence_key=evidence_key,
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                source_id=source_id,
                window_start=window_start,
                agent_id=agent_id,
                event_id=event_id,
                correlation_id=correlation_id,
                payload=payload,
                updated_at=func.now(),
            )
            .on_conflict_do_nothing(index_elements=[table.c.evidence_key])
            .returning(table.c.event_id, table.c.correlation_id)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
            if row:
                return {"duplicate": False, **dict(row)}
            existing = (
                conn.execute(
                    select(table.c.event_id, table.c.correlation_id).where(
                        table.c.evidence_key == evidence_key
                    )
                )
                .mappings()
                .one()
            )
        return {"duplicate": True, **dict(existing)}
