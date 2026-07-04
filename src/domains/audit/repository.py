"""audit 도메인 repository — 불변 감사 로그."""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.audit.models import AuditLog
from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.storage.engine import DatabaseConnection


def audit_log_row(evt: EventEnvelope) -> JsonObject:
    """감사 로그 insert 행 매핑 — 단건·벌크가 같은 매핑을 공유함(단일 출처)."""
    return {
        "event_id": evt.event_id,
        "subject": evt.subject,
        "source": evt.source,
        "correlation_id": evt.correlation_id,
        "payload": evt.payload,
    }


class AuditLogRepository(DatabaseConnection):
    def append_audit_logs(self, rows: list[JsonObject]) -> None:
        """감사 로그 벌크 INSERT — executemany 스타일로 한 문장에 적재함."""
        if not rows:
            return
        with self.connection() as conn:
            conn.execute(pg_insert(AuditLog.__table__), rows)

    def append_audit_log(self, evt: EventEnvelope) -> None:
        # 단건도 벌크 경로로 위임해 insert 매핑을 한 곳으로 유지함
        self.append_audit_logs([audit_log_row(evt)])
