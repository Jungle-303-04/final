"""G3 D4 alert identity and repeat-delivery idempotency contract."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.dialects import postgresql

from domains.alert.models import AlertEvent
from domains.alert.repository import AlertRuleRepository
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


class _ConcurrentActivationConnection:
    def __init__(self, existing: dict[str, object]) -> None:
        self.existing = existing
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        sql = str(statement.compile(dialect=postgresql.dialect())).casefold()
        if "insert into alert_events" in sql:
            return _Result(None)
        if "from alert_events" in sql:
            return _Result(self.existing)
        if "insert into alert_rule_target_states" in sql:
            return _Result(
                {
                    "workspace_id": "workspace-a",
                    "rule_id": "rule-a",
                    "subject_key": "subject-a",
                    "active_event_id": self.existing["event_id"],
                }
            )
        raise AssertionError(f"unexpected concurrent activation SQL: {sql}")


def test_concurrent_alert_activation_reloads_the_single_active_event() -> None:
    fired_at = datetime(2026, 7, 19, tzinfo=UTC)
    existing = {
        "event_id": "ale-existing",
        "workspace_id": "workspace-a",
        "rule_id": "rule-a",
        "rule_name": "CPU",
        "source": "opsia",
        "severity": "critical",
        "subject_key": "subject-a",
        "subject": {
            "cluster": "cluster-a",
            "namespace": "shop",
            "kind": "Pod",
            "name": "api-0",
        },
        "fired_at": fired_at,
        "resolved_at": None,
        "status": "firing",
        "observed_value": 95.0,
        "threshold": 80.0,
        "evidence": [{"type": "metric_sample", "summary": "high"}],
        "incident_id": None,
    }
    candidate = {**existing, "event_id": "ale-racing"}
    connection = _ConcurrentActivationConnection(existing)
    repository = object.__new__(AlertRuleRepository)

    @contextmanager
    def connect():
        yield connection

    repository.connection = connect  # type: ignore[method-assign]
    repository.unit_of_work = connect  # type: ignore[method-assign]

    saved, created = repository.activate_alert_rule_event(
        {
            "workspace_id": "workspace-a",
            "rule_id": "rule-a",
            "subject_key": "subject-a",
            "subject": existing["subject"],
            "condition_since": fired_at,
            "last_observed_value": 95.0,
            "last_evidence": existing["evidence"],
            "last_evaluated_at": fired_at,
        },
        candidate,
    )

    assert created is False
    assert saved["event_id"] == "ale-existing"
    event_insert = next(
        statement
        for statement in connection.statements
        if "insert into alert_events"
        in str(statement.compile(dialect=postgresql.dialect())).casefold()
    )
    event_insert_sql = str(event_insert.compile(dialect=postgresql.dialect())).casefold()
    assert "on conflict (rule_id, subject_key)" in event_insert_sql
    assert "where status in" in event_insert_sql


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
