"""audit 프로젝터(@app.on_any, 전체 구독) 동작 검증."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any

from conftest import SpyDb, load_service, run_handler

from domains.audit.repository import AuditLogRepository, audit_log_row
from packages.contracts.event_bus.interfaces import EventEnvelope


def _evt(
    subject: str,
    source: str = "rca-worker",
    payload: dict[str, object] | None = None,
    causation_id: str | None = None,
    workspace_id: str | None = None,
) -> EventEnvelope:
    return EventEnvelope(
        event_id="e1",
        subject=subject,
        source=source,
        correlation_id="c1",
        causation_id=causation_id,
        created_at="t",
        payload=payload or {},
        workspace_id=workspace_id,
    )


def test_audit_log_row_preserves_causation_id() -> None:
    evt = _evt(
        "rca.completed",
        causation_id="parent-event-1",
        workspace_id="workspace-1",
    )
    row = audit_log_row(evt)

    assert row["causation_id"] == "parent-event-1"
    assert row["workspace_id"] == "workspace-1"


def test_audit_appends_log_without_chaining() -> None:
    audit = load_service("projection/audit-worker")
    db = SpyDb()
    outs = run_handler(audit.on_event, _evt("command.requested"), db=db)
    assert outs == []
    # 단건 이벤트도 벌크 INSERT 경로로 적재됨(행 매핑은 audit_log_row 단일 출처)
    assert db.calls == [("append_audit_logs", ([audit_log_row(_evt("command.requested"))],))]


def _repository_with_stub_connection(executed: list[tuple[Any, Any]]) -> AuditLogRepository:
    class StubConnection:
        def execute(self, statement: Any, rows: Any = None) -> None:
            executed.append((statement, rows))

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(AuditLogRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    return repository


def test_append_audit_logs_bulk_inserts_in_single_statement() -> None:
    executed: list[tuple[Any, Any]] = []
    rows = [audit_log_row(_evt("a.b")), audit_log_row(_evt("c.d"))]

    _repository_with_stub_connection(executed).append_audit_logs(rows)

    # 행 수와 무관하게 executemany 스타일 한 문장으로 실행됨
    assert len(executed) == 1
    assert executed[0][1] == rows


def test_append_audit_logs_skips_empty_batch() -> None:
    executed: list[tuple[Any, Any]] = []
    _repository_with_stub_connection(executed).append_audit_logs([])
    assert executed == []


def test_append_audit_log_delegates_to_bulk_path() -> None:
    executed: list[tuple[Any, Any]] = []
    evt = _evt("command.requested")

    _repository_with_stub_connection(executed).append_audit_log(evt)

    assert len(executed) == 1
    assert executed[0][1] == [audit_log_row(evt)]
