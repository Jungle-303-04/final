"""dashboard 프로젝터가 RCA 이벤트를 화면용 timeline row로 바꾸는지 검증."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any

from conftest import SpyDb, load_service, run_handler
from sqlalchemy.dialects import postgresql

from domains.dashboard.repository import DashboardRepository, timeline_update_from_event
from packages.contracts.event_bus.interfaces import EventEnvelope


def _evt(
    subject: str,
    payload: dict[str, object] | None = None,
    *,
    event_id: str = "evt-1",
    correlation_id: str = "corr-1",
) -> EventEnvelope:
    return EventEnvelope(
        event_id=event_id,
        subject=subject,
        source="rca-worker",
        correlation_id=correlation_id,
        causation_id=None,
        created_at="2026-07-05T10:00:00Z",
        payload=payload or {},
    )


def _rca_completed_payload() -> dict[str, object]:
    return {
        "workspace_id": "workspace-1",
        "root_cause": "image_pull_backoff",
        "action": "이미지 pull secret 확인",
        "evidence_ref": "evidence://cluster-1/incident-1",
        "evidence": {
            "workspace_id": "workspace-1",
            "cluster_id": "cluster-1",
            "object_ref": "evidence://cluster-1/incident-1",
        },
        "incident": {
            "workspace_id": "workspace-1",
            "incident_id": "incident-1",
            "cluster_id": "cluster-1",
            "resource_kind": "Deployment",
            "resource_name": "checkout-api",
            "namespace": "shop",
            "symptom": "ImagePullBackOff",
            "severity": "high",
            "first_seen_at": "2026-07-05T09:55:00Z",
            "summary": "checkout-api 이미지 pull 실패",
        },
        "evidence_bundle": {
            "incident_id": "incident-1",
            "items": [],
            "missing_evidence": ["trace-span"],
            "complete": False,
        },
        "rca_detail": {
            "root_cause": "image_pull_backoff",
            "confidence": 0.92,
            "selected_candidate_id": "image-pull",
            "supporting_evidence": ["pod waiting reason", "registry 401"],
            "missing_evidence": ["trace-span"],
            "reason": "Pod 상태와 kube event가 같은 원인을 가리킨다.",
        },
    }


def test_dashboard_worker_upserts_timeline_row_without_chaining() -> None:
    dashboard = load_service("projection/dashboard-worker")
    db = SpyDb()
    evt = _evt("rca.completed", _rca_completed_payload())

    outs = run_handler(dashboard.on_event, evt, db=db)

    assert outs == []
    assert len(db.calls) == 1
    name, args = db.calls[0]
    assert name == "upsert_rca_timeline"
    row = args[0]
    assert row["workspace_id"] == "workspace-1"
    assert row["correlation_id"] == "corr-1"
    assert row["cluster_id"] == "cluster-1"
    assert row["incident_id"] == "incident-1"
    assert row["status"] == "rca_completed"
    assert row["root_cause"] == "image_pull_backoff"
    assert row["confidence"] == 0.92
    assert row["supporting_evidence"] == ["pod waiting reason", "registry 401"]
    assert row["missing_evidence"] == ["trace-span"]


def test_dashboard_worker_ignores_unmapped_subjects() -> None:
    dashboard = load_service("projection/dashboard-worker")
    db = SpyDb()

    outs = run_handler(dashboard.on_event, _evt("mail.email_verification.sent"), db=db)

    assert outs == []
    assert db.calls == []


def test_timeline_update_preserves_command_and_pr_status_inputs() -> None:
    command = timeline_update_from_event(
        _evt(
            "command.queued_for_agent",
            {
                "workspace_id": "workspace-1",
                "cluster_id": "cluster-1",
                "command_id": "cmd-1",
            },
        )
    )
    pr = timeline_update_from_event(
        _evt(
            "safe_pr.created",
            {
                "workspace_id": "workspace-1",
                "pr_url": "https://github.example/pull/1",
            },
        )
    )

    assert command is not None
    assert command["status"] == "command_queued"
    assert command["command_id"] == "cmd-1"
    assert command["action_route"] == "command"
    assert pr is not None
    assert pr["status"] == "pr_created"
    assert pr["pr_url"] == "https://github.example/pull/1"
    assert pr["action_route"] == "safe_pr"


class _FakeConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> None:
        self.statements.append(statement)


def _repository_with_fake_connection(connection: _FakeConnection) -> DashboardRepository:
    @contextmanager
    def fake_connection():
        yield connection

    repository = object.__new__(DashboardRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]
    return repository


def test_upsert_rca_timeline_uses_correlation_conflict_and_preserves_known_fields() -> None:
    connection = _FakeConnection()
    row = timeline_update_from_event(_evt("rca.completed", _rca_completed_payload()))
    assert row is not None

    _repository_with_fake_connection(connection).upsert_rca_timeline(row)

    assert len(connection.statements) == 1
    compiled = connection.statements[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "ON CONFLICT" in sql
    assert "workspace_id" in sql
    assert "correlation_id" in sql
    assert "coalesce" in sql.lower()
