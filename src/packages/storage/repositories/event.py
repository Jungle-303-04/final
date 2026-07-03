from __future__ import annotations

from typing import Any

from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection

from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.contracts.event_bus.processing import (
    CLAIM_BLOCKED,
    TERMINAL_STATUSES,
    EventProcessingStatus,
)
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

# PROCESSING claim 신선도 창 — 이 시간 안의 PROCESSING 은 다른 소비자 인스턴스가
# 실제 처리 중인 것으로 간주해 재클레임 거절(JetStream 재배달과의 동시 중복 처리 방지).
# ack_wait(60s) 뒤 재배달이 와도 원 claim 이 이 창을 넘길 때까지는 획득 불가함.
PROCESSING_STALE_SECONDS = 90


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
            row = self.claim_event_processing(conn, table, evt, consumer)
            if row:
                return EventProcessingRecord(status=row["status"], attempts=row["attempts"])

            existing = self.get_event_processing(conn, table, evt, consumer)
            if existing:
                status = str(existing["status"])
                if status == EventProcessingStatus.PROCESSING:
                    # 신선한 PROCESSING 이 claim 을 거절 = 다른 인스턴스가 처리 중
                    # → 종결도 획득도 아닌 미획득 신호로 치환(워커가 nak 로 미룸)
                    status = CLAIM_BLOCKED
                return EventProcessingRecord(status=status, attempts=existing["attempts"])
            return EventProcessingRecord(status="unknown", attempts=0)

    def claim_event_processing(
        self, conn: Connection, table: Any, evt: EventEnvelope, consumer: str
    ) -> JsonObject | None:
        """단일 원자 UPSERT 로 처리권 claim + attempt 누적.

        재클레임 허용 조건: 종결(PROCESSED/DEAD_LETTERED) 아님 그리고
        (PROCESSING 아님 또는 updated_at 이 신선도 창을 넘김 = 죽은 claim).
        신선한 PROCESSING 이면 행을 반환하지 않음(동시 중복 처리 차단).
        """
        insert = pg_insert(table).values(
            event_id=evt.event_id,
            consumer=consumer,
            subject=evt.subject,
            correlation_id=evt.correlation_id,
            status=EventProcessingStatus.PROCESSING,
            attempts=1,
            last_error=None,
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.event_id, table.c.consumer],
            set_={
                "attempts": table.c.attempts + 1,
                "status": EventProcessingStatus.PROCESSING,
                "last_error": None,
                "updated_at": func.now(),
            },
            where=and_(
                table.c.status.not_in(TERMINAL_STATUSES),
                or_(
                    table.c.status != EventProcessingStatus.PROCESSING,
                    table.c.updated_at
                    < func.now() - text(f"interval '{int(PROCESSING_STALE_SECONDS)} seconds'"),
                ),
            ),
        ).returning(table.c.status, table.c.attempts)
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
