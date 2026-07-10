from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection

from packages.config.logs import CONTEXT_KEY, get_logger
from packages.contracts.event_bus.interfaces import (
    EventConsumerMetrics,
    EventEnvelope,
    JsonObject,
)
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
    EventConsumerMetric,
    EventModel,
    EventProcessing,
)

# PROCESSING claim 신선도 창 — 이 시간 안의 PROCESSING 은 다른 소비자 인스턴스가
# 실제 처리 중인 것으로 간주해 재클레임 거절(JetStream 재배달과의 동시 중복 처리 방지).
# ack_wait(60s) 뒤 재배달이 와도 원 claim 이 이 창을 넘길 때까지는 획득 불가함.
PROCESSING_STALE_SECONDS = 90
LOGGER = get_logger(__name__)


def event_log_context(evt: EventEnvelope) -> JsonObject:
    return {
        "event_id": evt.event_id,
        "subject": evt.subject,
        "source": evt.source,
        "correlation_id": evt.correlation_id,
        "causation_id": evt.causation_id,
    }


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
                schema_version=evt.schema_version,
            )
            .on_conflict_do_nothing(index_elements=[table.c.event_id])
        )
        with self.connection() as conn:
            conn.execute(statement)
        LOGGER.info("db_event_recorded", extra={CONTEXT_KEY: event_log_context(evt)})

    def begin_event_processing(self, evt: EventEnvelope, consumer: str) -> EventProcessingRecord:
        table = EventProcessing.__table__
        with self.connection() as conn:
            row = self.claim_event_processing(conn, table, evt, consumer)
            if row:
                LOGGER.info(
                    "db_event_processing_claimed",
                    extra={
                        CONTEXT_KEY: {
                            **event_log_context(evt),
                            "consumer": consumer,
                            "status": row["status"],
                            "attempts": row["attempts"],
                        }
                    },
                )
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

    def finish_event_processing(
        self, evt: EventEnvelope, consumer: str, duration_ms: int | None = None
    ) -> None:
        table = EventProcessing.__table__
        values: JsonObject = {
            "status": EventProcessingStatus.PROCESSED,
            "last_error": None,
            "updated_at": func.now(),
        }
        if duration_ms is not None:
            values["processing_duration_ms"] = max(0, int(duration_ms))
        statement = (
            update(table)
            .where(table.c.event_id == evt.event_id, table.c.consumer == consumer)
            .values(**values)
        )
        with self.connection() as conn:
            conn.execute(statement)
        LOGGER.info("db_event_recorded", extra={CONTEXT_KEY: event_log_context(evt)})
        LOGGER.info(
            "db_event_processing_finished",
            extra={
                CONTEXT_KEY: {
                    **event_log_context(evt),
                    "consumer": consumer,
                    "status": EventProcessingStatus.PROCESSED,
                    "processing_duration_ms": duration_ms,
                }
            },
        )

    def fail_event_processing(
        self,
        evt: EventEnvelope,
        consumer: str,
        error: str,
        status: str,
        duration_ms: int | None = None,
    ) -> None:
        table = EventProcessing.__table__
        values: JsonObject = {
            "status": status,
            "last_error": compact_error(error),
            "updated_at": func.now(),
        }
        if duration_ms is not None:
            values["processing_duration_ms"] = max(0, int(duration_ms))
        statement = (
            update(table)
            .where(table.c.event_id == evt.event_id, table.c.consumer == consumer)
            .values(**values)
        )
        with self.connection() as conn:
            conn.execute(statement)
        LOGGER.info(
            "db_event_processing_failed",
            extra={
                CONTEXT_KEY: {
                    **event_log_context(evt),
                    "consumer": consumer,
                    "status": status,
                    "processing_duration_ms": duration_ms,
                }
            },
        )

    def event_processing_status_counts(self) -> dict[str, int]:
        table = EventProcessing.__table__
        statement = select(table.c.status, func.count().label("count")).group_by(table.c.status)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return {row["status"]: int(row["count"]) for row in rows}

    def event_processing_duration_avg_ms_by_consumer(self) -> dict[str, float]:
        table = EventProcessing.__table__
        statement = (
            select(table.c.consumer, func.avg(table.c.processing_duration_ms).label("duration"))
            .where(table.c.processing_duration_ms.is_not(None))
            .group_by(table.c.consumer)
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return {str(row["consumer"]): float(row["duration"] or 0) for row in rows}

    def event_processing_duration_max_ms_by_consumer(self) -> dict[str, int]:
        table = EventProcessing.__table__
        statement = (
            select(table.c.consumer, func.max(table.c.processing_duration_ms).label("duration"))
            .where(table.c.processing_duration_ms.is_not(None))
            .group_by(table.c.consumer)
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return {str(row["consumer"]): int(row["duration"] or 0) for row in rows}

    def record_event_consumer_metrics(self, sample: EventConsumerMetrics) -> None:
        table = EventConsumerMetric.__table__
        insert = pg_insert(table).values(
            consumer=sample.durable,
            subject=sample.subject,
            stream=sample.stream,
            pending_events=max(0, int(sample.pending)),
            ack_pending_events=max(0, int(sample.ack_pending)),
            redelivered_events=max(0, int(sample.redelivered)),
            observed_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.consumer, table.c.subject],
            set_={
                "stream": insert.excluded.stream,
                "pending_events": insert.excluded.pending_events,
                "ack_pending_events": insert.excluded.ack_pending_events,
                "redelivered_events": insert.excluded.redelivered_events,
                "observed_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)

    def event_consumer_pending_by_consumer_subject(self) -> dict[tuple[str, str], int]:
        return self._event_consumer_metric_values("pending_events")

    def event_consumer_ack_pending_by_consumer_subject(self) -> dict[tuple[str, str], int]:
        return self._event_consumer_metric_values("ack_pending_events")

    def event_consumer_redelivered_by_consumer_subject(self) -> dict[tuple[str, str], int]:
        return self._event_consumer_metric_values("redelivered_events")

    def _event_consumer_metric_values(self, column_name: str) -> dict[tuple[str, str], int]:
        table = EventConsumerMetric.__table__
        column = getattr(table.c, column_name)
        statement = select(table.c.consumer, table.c.subject, column)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return {
            (str(row["consumer"]), str(row["subject"])): int(row[column_name] or 0) for row in rows
        }

    def delete_events_older_than(self, cutoff: datetime, *, limit: int = 1000) -> int:
        """이벤트 원장을 보존 기간 이후 배치 삭제한다."""
        table = EventModel.__table__
        expired = (
            select(table.c.event_id)
            .where(table.c.created_at < cutoff)
            .order_by(table.c.created_at, table.c.event_id)
            .limit(limit)
            .cte("expired_events")
        )
        statement = (
            table.delete()
            .where(table.c.event_id.in_(select(expired.c.event_id)))
            .returning(table.c.event_id)
        )
        with self.connection() as conn:
            return len(conn.execute(statement).all())
