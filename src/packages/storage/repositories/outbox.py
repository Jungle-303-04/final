from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.storage.engine import (
    DatabaseConnection,
)
from packages.storage.schema import (
    OutboxModel,
)

DEFAULT_OUTBOX_LEASE_SECONDS = 60


class OutboxRepository(DatabaseConnection):
    def stage_events(self, conn: Connection, events: list[EventEnvelope]) -> None:
        """UoW 트랜잭션 안에서 outbox 적재(같은 커넥션). [완전판 3단계]"""
        table = OutboxModel.__table__
        for evt in events:
            conn.execute(
                pg_insert(table)
                .values(
                    event_id=evt.event_id,
                    subject=evt.subject,
                    source=evt.source,
                    correlation_id=evt.correlation_id,
                    causation_id=evt.causation_id,
                    occurred_at=evt.created_at,
                    payload=evt.payload,
                    lease_id=None,
                    leased_until=None,
                )
                .on_conflict_do_nothing(index_elements=[table.c.event_id])
            )

    async def unsent_events(self, limit: int, source: str) -> list[EventEnvelope]:
        table = OutboxModel.__table__
        lease_id = str(uuid.uuid4())
        leased_until = datetime.now(UTC) + timedelta(seconds=DEFAULT_OUTBOX_LEASE_SECONDS)
        available = or_(table.c.lease_id.is_(None), table.c.leased_until < func.now())
        claimable = (
            select(table.c.id)
            .where(table.c.sent_at.is_(None), table.c.source == source, available)
            .order_by(table.c.id)
            .limit(limit)
            .with_for_update(skip_locked=True)
            .cte("claimable_outbox")
        )
        stmt = (
            update(table)
            .where(table.c.id.in_(select(claimable.c.id)))
            .values(lease_id=lease_id, leased_until=leased_until)
            .returning(table)
        )
        async with self.async_connection() as conn:
            rows = (await conn.execute(stmt)).mappings().all()
        return [
            EventEnvelope.from_mapping(
                {
                    "event_id": r["event_id"],
                    "subject": r["subject"],
                    "source": r["source"],
                    "correlation_id": r["correlation_id"],
                    "causation_id": r["causation_id"],
                    "created_at": r["occurred_at"],
                    "payload": r["payload"],
                }
            )
            for r in rows
        ]

    async def mark_events_sent(self, event_ids: list[str]) -> None:
        table = OutboxModel.__table__
        stmt = (
            update(table)
            .where(table.c.event_id.in_(event_ids))
            .values(sent_at=func.now(), lease_id=None, leased_until=None)
        )
        async with self.async_connection() as conn:
            await conn.execute(stmt)

    def outbox_pending_count(self) -> int:
        table = OutboxModel.__table__
        statement = select(func.count()).where(table.c.sent_at.is_(None))
        with self.connection() as conn:
            return int(conn.execute(statement).scalar() or 0)
