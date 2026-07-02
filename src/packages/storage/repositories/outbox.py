from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.storage.engine import (
    DatabaseConnection,
)
from packages.storage.schema import (
    OutboxModel,
)


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
                )
                .on_conflict_do_nothing(index_elements=[table.c.event_id])
            )

    async def unsent_events(self, limit: int, source: str) -> list[EventEnvelope]:
        table = OutboxModel.__table__
        stmt = (
            select(table)
            .where(table.c.sent_at.is_(None), table.c.source == source)
            .order_by(table.c.id)
            .limit(limit)
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
        stmt = update(table).where(table.c.event_id.in_(event_ids)).values(sent_at=func.now())
        async with self.async_connection() as conn:
            await conn.execute(stmt)

    def outbox_pending_count(self) -> int:
        table = OutboxModel.__table__
        statement = select(func.count()).where(table.c.sent_at.is_(None))
        with self.connection() as conn:
            return int(conn.execute(statement).scalar() or 0)
