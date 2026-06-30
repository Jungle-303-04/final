from __future__ import annotations

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.storage.engine import (
    DEAD_LETTER_STATUS_OPEN,
    DEAD_LETTER_STATUS_REPLAYED,
    RAW_DEAD_LETTER_SUBJECT,
    DatabaseConnection,
    compact_error,
    serialize_dead_letter,
)
from packages.storage.schema import (
    EventDeadLetter,
)


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


