from __future__ import annotations

from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection

from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.contracts.event_bus.processing import EventProcessingStatus
from packages.contracts.interfaces import EventProcessingRecord
from packages.storage.engine import (
    DatabaseConnection,
    compact_error,
    row_dict,
)
from packages.storage.schema import (
    EventModel,
    EventProcessing,
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
                causation_id=evt.causation_id,
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
