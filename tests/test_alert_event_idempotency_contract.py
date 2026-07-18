"""G3 D4 alert identity and repeat-delivery idempotency contract."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any

from sqlalchemy.dialects import postgresql

from domains.alert.models import AlertEvent
from domains.target.repository import TargetAgentRepository
from packages.events.envelope import event


class _Result:
    def __init__(self, row: dict[str, object] | None) -> None:
        self.row = row

    def mappings(self) -> _Result:
        return self

    def first(self) -> dict[str, object] | None:
        return self.row

    def one(self) -> dict[str, object]:
        assert self.row is not None
        return self.row


class _DuplicateConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        if len(self.statements) == 1:
            return _Result(None)
        return _Result({"event_id": "event-stable", "correlation_id": "correlation-stable"})


def test_alert_event_id_is_the_durable_ledger_identity() -> None:
    table = AlertEvent.__table__

    assert tuple(column.name for column in table.primary_key.columns) == ("event_id",)
    active_subject = next(
        index for index in table.indexes if index.name == "uq_alert_events_active_subject"
    )
    assert active_subject.unique is True
    predicate = str(active_subject.dialect_options["postgresql"]["where"]).casefold()
    assert "status in ('firing', 'acked')" in predicate


def test_repeat_alertmanager_delivery_returns_existing_event_without_restaging() -> None:
    connection = _DuplicateConnection()
    repository = object.__new__(TargetAgentRepository)

    @contextmanager
    def connect():
        yield connection

    repository.connection = connect  # type: ignore[method-assign]

    result = repository.record_evidence_event_once(
        evidence_key="workspace-a:cluster-a:alertmanager:fingerprint",
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        source_id="alertmanager-webhook",
        window_start="2026-07-19T00:00:00Z",
        agent_id=None,
        event_envelope=event(
            "cluster.evidence.received",
            "api-gateway",
            {"workspace_id": "workspace-a", "cluster_id": "cluster-a"},
            "correlation-new",
        ),
        payload={"workspace_id": "workspace-a", "cluster_id": "cluster-a"},
    )

    assert result == {
        "duplicate": True,
        "event_id": "event-stable",
        "correlation_id": "correlation-stable",
    }
    assert len(connection.statements) == 2
    insert_sql = str(connection.statements[0].compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT (evidence_key) DO NOTHING" in insert_sql
    assert all(
        "INSERT INTO events" not in str(statement.compile(dialect=postgresql.dialect()))
        and "INSERT INTO outbox" not in str(statement.compile(dialect=postgresql.dialect()))
        for statement in connection.statements
    )
