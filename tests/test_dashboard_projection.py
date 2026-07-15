"""dashboard 프로젝터가 RCA 이벤트를 화면용 timeline row로 바꾸는지 검증."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any

from conftest import SpyDb, load_service, run_handler
from sqlalchemy.dialects import postgresql

from domains.dashboard.repository import (
    DashboardRepository,
    incident_logical_key,
    incident_logical_key_from_projection,
    timeline_update_from_event,
)
from packages.contracts.event_bus.interfaces import EventEnvelope


def _evt(
    subject: str,
    payload: dict[str, object] | None = None,
    *,
    event_id: str = "evt-1",
    correlation_id: str = "corr-1",
) -> EventEnvelope:
    body = payload or {}
    return EventEnvelope(
        event_id=event_id,
        subject=subject,
        source="rca-worker",
        correlation_id=correlation_id,
        causation_id=None,
        created_at="2026-07-05T10:00:00Z",
        payload=body,
        workspace_id=str(body.get("workspace_id") or "workspace-1"),
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
    assert row["incident_namespace"] == "shop"
    assert row["incident_resource_kind"] == "Deployment"
    assert row["incident_resource_name"] == "checkout-api"
    assert row["incident_symptom"] == "ImagePullBackOff"
    assert row["incident_logical_key"] == "cluster-1|shop|Deployment|checkout-api|ImagePullBackOff"
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


def test_dashboard_worker_ignores_pre_incident_evidence_events() -> None:
    dashboard = load_service("projection/dashboard-worker")
    for subject in ("cluster.evidence.received", "evidence.built"):
        db = SpyDb()

        outs = run_handler(
            dashboard.on_event,
            _evt(
                subject,
                {
                    "workspace_id": "workspace-1",
                    "cluster_id": "cluster-1",
                    "evidence_key": "evidence-1",
                },
            ),
            db=db,
        )

        assert outs == []
        assert db.calls == []


def test_dashboard_worker_ignores_non_incident_detection() -> None:
    dashboard = load_service("projection/dashboard-worker")
    db = SpyDb()
    evt = _evt(
        "incident.detected",
        {
            "workspace_id": "workspace-1",
            "cluster_id": "cluster-1",
            "detected": False,
            "reason": "no deterministic incident signal found",
            "incident": {
                "incident_id": "normal-sample-1",
                "cluster_id": "cluster-1",
                "symptom": "unknown",
            },
        },
    )

    outs = run_handler(dashboard.on_event, evt, db=db)

    assert outs == []
    assert db.calls == []
    assert timeline_update_from_event(evt) is None


def test_dashboard_worker_ignores_lifecycle_command_without_incident_id() -> None:
    dashboard = load_service("projection/dashboard-worker")
    db = SpyDb()
    evt = _evt(
        "approval.recommended",
        {
            "workspace_id": "workspace-1",
            "cluster_id": "cluster-1",
            "workflow_run_id": "workflow-uninstall-1",
            "action": "uninstall_cluster_agent",
        },
    )

    outs = run_handler(dashboard.on_event, evt, db=db)

    assert outs == []
    assert db.calls == []
    assert timeline_update_from_event(evt) is None


def test_incident_projection_logical_key_matches_payload_key() -> None:
    payload_row = {
        "cluster_id": "cluster-1",
        "incident_id": "incident-1",
        "correlation_id": "corr-1",
        "payload": {
            "incident": {
                "namespace": "default",
                "resource_kind": "Deployment",
                "resource_name": "api",
                "symptom": "CrashLoopBackOff",
            }
        },
    }
    projected_row = {
        "cluster_id": "cluster-1",
        "incident_id": "incident-1",
        "correlation_id": "corr-1",
        "incident_namespace": "default",
        "incident_resource_kind": "Deployment",
        "incident_resource_name": "api",
        "incident_symptom": "CrashLoopBackOff",
        "incident_logical_key": "cluster-1|default|Deployment|api|CrashLoopBackOff",
    }

    assert incident_logical_key_from_projection(projected_row) == incident_logical_key(payload_row)


def test_incident_projection_logical_key_falls_back_to_incident_id() -> None:
    assert (
        incident_logical_key_from_projection(
            {
                "id": 1,
                "incident_id": "incident-1",
                "correlation_id": "corr-1",
                "cluster_id": "cluster-1",
            }
        )
        == "incident-1"
    )


def test_incident_projection_rebuilds_legacy_correlation_key_from_dimensions() -> None:
    assert (
        incident_logical_key_from_projection(
            {
                "incident_id": "incident-1",
                "incident_logical_key": "legacy-correlation-uuid",
                "cluster_id": "cluster-1",
                "incident_namespace": "sandbox",
                "incident_resource_kind": "Deployment",
                "incident_resource_name": "orders-api",
                "incident_symptom": "Ingress 502/503",
            }
        )
        == "cluster-1|sandbox|Deployment|orders-api|Ingress 502/503"
    )


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
    assert command["incident_logical_key"] is None
    assert pr is not None
    assert pr["status"] == "pr_created"
    assert pr["pr_url"] == "https://github.example/pull/1"
    assert pr["action_route"] == "safe_pr"
    assert pr["incident_logical_key"] is None


class _RecordingConnection:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.statements: list[Any] = []
        self.rows = rows or []

    def execute(self, statement: Any) -> _RowsResult:
        self.statements.append(statement)
        return _RowsResult(self.rows)


class _RowsResult:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> _RowsResult:
        return self

    def all(self) -> list[dict[str, Any]]:
        return self.rows

    def first(self) -> dict[str, Any] | None:
        return self.rows[0] if self.rows else None


def _repository_with_recording_connection(connection: _RecordingConnection) -> DashboardRepository:
    @contextmanager
    def recording_connection():
        yield connection

    repository = object.__new__(DashboardRepository)
    repository.connection = recording_connection  # type: ignore[method-assign]
    return repository


def test_upsert_rca_timeline_uses_correlation_conflict_and_preserves_known_fields() -> None:
    connection = _RecordingConnection()
    row = timeline_update_from_event(_evt("rca.completed", _rca_completed_payload()))
    assert row is not None

    _repository_with_recording_connection(connection).upsert_rca_timeline(row)

    assert len(connection.statements) == 1
    compiled = connection.statements[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "ON CONFLICT" in sql
    assert "workspace_id" in sql
    assert "correlation_id" in sql
    assert "coalesce" in sql.lower()
    assert "CASE" in sql
    assert "last_event_at" in sql


def test_open_incident_query_excludes_non_incident_detection_rows() -> None:
    connection = _RecordingConnection()

    result = _repository_with_recording_connection(connection).count_open_rca_incidents(
        "workspace-1",
        {"cluster-1"},
    )

    assert result == {}
    assert len(connection.statements) == 1
    compiled = connection.statements[0].compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    sql = str(compiled)
    assert "incident.detected" in sql
    assert "detected" in sql
    assert "IS true" in sql
    assert "GROUP BY" in sql
    assert "count(distinct" in sql.lower()
    assert "incident_logical_key" in sql
    assert "concat_ws" in sql.lower()
    assert "#>>" not in sql
    assert "status IN" in sql
    assert "evidence_received" not in sql
    assert "evidence_built" not in sql
    assert "incident_detected" in sql
    # Pod/ReplicaSet incidents are active only while the same unhealthy object exists in
    # the latest collected inventory snapshot. Historical timeline rows remain queryable.
    assert "cluster_inventory_resources" in sql
    assert "cluster_inventory_snapshots" in sql
    assert "snapshot_id" in sql
    assert "health" in sql


def test_open_incident_query_returns_sql_aggregate_rows() -> None:
    connection = _RecordingConnection(
        [
            {"cluster_id": "cluster-1", "open_incidents": 2},
            {"cluster_id": "cluster-2", "open_incidents": 0},
        ]
    )

    result = _repository_with_recording_connection(connection).count_open_rca_incidents(
        "workspace-1",
        {"cluster-1", "cluster-2"},
    )

    assert result == {"cluster-1": 2, "cluster-2": 0}
