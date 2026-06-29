from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection

from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.contracts.event_bus.processing import EventProcessingStatus
from packages.contracts.interfaces import EventProcessingRecord
from packages.storage.engine import (
    DEAD_LETTER_STATUS_OPEN,
    DEAD_LETTER_STATUS_REPLAYED,
    RAW_DEAD_LETTER_SUBJECT,
    DatabaseConnection,
    compact_error,
    row_dict,
    serialize_dead_letter,
)
from packages.storage.schema import (
    EventDeadLetter,
    EventModel,
    EventProcessing,
    OutboxModel,
)


class EventRepository(DatabaseConnection):
    def record_event(self, evt: EventEnvelope) -> None:
        table = EventModel.__table__
        statement = (
            pg_insert(table)
            .values(
                event_id=evt.event_id,
                subject=evt.subject,
                source=evt.source,
                correlation_id=evt.correlation_id,
                payload=evt.payload,
            )
            .on_conflict_do_nothing(index_elements=[table.c.event_id])
        )
        with self.connection() as conn:
            conn.execute(statement)

    def begin_event_processing(self, evt: EventEnvelope, consumer: str) -> EventProcessingRecord:
        table = EventProcessing.__table__
        with self.connection() as conn:
            self.insert_event_processing(conn, table, evt, consumer)
            row = self.claim_event_processing(conn, table, evt, consumer)
            if row:
                return EventProcessingRecord(status=row["status"], attempts=row["attempts"])

            existing = self.get_event_processing(conn, table, evt, consumer)
            if existing:
                return EventProcessingRecord(
                    status=existing["status"], attempts=existing["attempts"]
                )
            return EventProcessingRecord(status="unknown", attempts=0)

    def insert_event_processing(
        self, conn: Connection, table: Any, evt: EventEnvelope, consumer: str
    ) -> None:
        statement = (
            pg_insert(table)
            .values(
                event_id=evt.event_id,
                consumer=consumer,
                subject=evt.subject,
                correlation_id=evt.correlation_id,
                status=EventProcessingStatus.PROCESSING,
                attempts=0,
                updated_at=func.now(),
            )
            .on_conflict_do_nothing(index_elements=[table.c.event_id, table.c.consumer])
        )
        conn.execute(statement)

    def claim_event_processing(
        self, conn: Connection, table: Any, evt: EventEnvelope, consumer: str
    ) -> JsonObject | None:
        statement = (
            update(table)
            .where(table.c.event_id == evt.event_id)
            .where(table.c.consumer == consumer)
            .where(
                table.c.status.not_in(
                    (EventProcessingStatus.PROCESSED, EventProcessingStatus.DEAD_LETTERED)
                )
            )
            .values(
                attempts=table.c.attempts + 1,
                status=EventProcessingStatus.PROCESSING,
                last_error=None,
                updated_at=func.now(),
            )
            .returning(table.c.status, table.c.attempts)
        )
        row = conn.execute(statement).mappings().first()
        return row_dict(row) if row else None

    def get_event_processing(
        self, conn: Connection, table: Any, evt: EventEnvelope, consumer: str
    ) -> JsonObject | None:
        statement = select(table.c.status, table.c.attempts).where(
            table.c.event_id == evt.event_id, table.c.consumer == consumer
        )
        row = conn.execute(statement).mappings().first()
        return row_dict(row) if row else None

    def finish_event_processing(self, evt: EventEnvelope, consumer: str) -> None:
        table = EventProcessing.__table__
        statement = (
            update(table)
            .where(table.c.event_id == evt.event_id, table.c.consumer == consumer)
            .values(status=EventProcessingStatus.PROCESSED, last_error=None, updated_at=func.now())
        )
        with self.connection() as conn:
            conn.execute(statement)

    def fail_event_processing(
        self, evt: EventEnvelope, consumer: str, error: str, status: str
    ) -> None:
        table = EventProcessing.__table__
        statement = (
            update(table)
            .where(table.c.event_id == evt.event_id, table.c.consumer == consumer)
            .values(status=status, last_error=compact_error(error), updated_at=func.now())
        )
        with self.connection() as conn:
            conn.execute(statement)

    def event_processing_status_counts(self) -> dict[str, int]:
        table = EventProcessing.__table__
        statement = select(table.c.status, func.count().label("count")).group_by(table.c.status)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return {row["status"]: int(row["count"]) for row in rows}


class DeadLetterRepository(DatabaseConnection):
    def record_dead_letter(
        self, evt: EventEnvelope, consumer: str, error: str, attempts: int
    ) -> JsonObject:
        table = EventDeadLetter.__table__
        statement = (
            pg_insert(table)
            .values(
                original_event_id=evt.event_id,
                original_subject=evt.subject,
                consumer=consumer,
                correlation_id=evt.correlation_id,
                attempts=attempts,
                error=compact_error(error),
                payload=evt.payload,
                status=DEAD_LETTER_STATUS_OPEN,
            )
            .returning(table.c.id, table.c.created_at)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().one()
        return {
            "dead_letter_id": row["id"],
            "original_event_id": evt.event_id,
            "original_subject": evt.subject,
            "consumer": consumer,
            "correlation_id": evt.correlation_id,
            "attempts": attempts,
            "error": compact_error(error),
            "created_at": row["created_at"].isoformat(),
            "status": DEAD_LETTER_STATUS_OPEN,
        }

    def record_raw_dead_letter(self, raw: bytes, consumer: str, error: str) -> JsonObject:
        original_event_id = f"decode-failure:{uuid.uuid4()}"
        payload = {"raw": raw.decode(errors="replace")}
        table = EventDeadLetter.__table__
        statement = (
            pg_insert(table)
            .values(
                original_event_id=original_event_id,
                original_subject=RAW_DEAD_LETTER_SUBJECT,
                consumer=consumer,
                correlation_id=original_event_id,
                attempts=1,
                error=compact_error(error),
                payload=payload,
                status=DEAD_LETTER_STATUS_OPEN,
            )
            .returning(table.c.id, table.c.created_at)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().one()
        return {
            "dead_letter_id": row["id"],
            "original_event_id": original_event_id,
            "original_subject": RAW_DEAD_LETTER_SUBJECT,
            "consumer": consumer,
            "correlation_id": original_event_id,
            "attempts": 1,
            "error": compact_error(error),
            "created_at": row["created_at"].isoformat(),
            "status": DEAD_LETTER_STATUS_OPEN,
            "payload": payload,
        }

    def list_dead_letters(self, limit: int) -> list[JsonObject]:
        table = EventDeadLetter.__table__
        statement = select(table).order_by(table.c.created_at.desc()).limit(limit)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [serialize_dead_letter(row) for row in rows]

    def get_dead_letter(self, dead_letter_id: int) -> JsonObject | None:
        table = EventDeadLetter.__table__
        statement = select(table).where(table.c.id == dead_letter_id)
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return serialize_dead_letter(row) if row else None

    def mark_dead_letter_replayed(self, dead_letter_id: int, replay_event_id: str) -> None:
        table = EventDeadLetter.__table__
        statement = (
            update(table)
            .where(table.c.id == dead_letter_id)
            .values(
                status=DEAD_LETTER_STATUS_REPLAYED,
                replayed_at=func.now(),
                replay_event_id=replay_event_id,
            )
        )
        with self.connection() as conn:
            conn.execute(statement)

    def open_dead_letter_count(self) -> int:
        table = EventDeadLetter.__table__
        statement = select(func.count()).where(table.c.status == DEAD_LETTER_STATUS_OPEN)
        with self.connection() as conn:
            return int(conn.execute(statement).scalar() or 0)


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
