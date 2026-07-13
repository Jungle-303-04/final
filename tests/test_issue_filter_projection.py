"""Issues filter projection contract for event-time incident dimensions."""

from __future__ import annotations

from contextlib import contextmanager
from importlib import import_module
from typing import Any

from sqlalchemy import Boolean
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB

from domains.dashboard.models import RcaTimeline
from domains.dashboard.repository import DashboardRepository, timeline_update_from_event
from packages.contracts.event_bus.interfaces import EventEnvelope


def _event(subject: str, payload: dict[str, object]) -> EventEnvelope:
    return EventEnvelope(
        event_id="event-1",
        subject=subject,
        source="incident-worker",
        correlation_id="correlation-1",
        causation_id=None,
        created_at="2026-07-13T14:00:00Z",
        payload=payload,
        workspace_id="workspace-1",
    )


def _incident_payload(*, severity: str | None = "critical") -> dict[str, object]:
    incident: dict[str, object] = {
        "incident_id": "incident-1",
        "cluster_id": "cluster-1",
        "namespace": "shop",
        "resource_kind": "Deployment",
        "resource_name": "checkout-api",
        "symptom": "CrashLoopBackOff",
    }
    payload: dict[str, object] = {
        "workspace_id": "workspace-1",
        "cluster_id": "cluster-1",
        "detected": True,
        "incident": incident,
    }
    if severity is not None:
        payload["severity"] = severity
        incident["severity"] = severity
    return payload


def _extract_issue_evidence_labels(
    evidence: dict[str, object],
    *,
    cluster_id: str,
    namespace: str | None,
    resource_kind: str,
    resource_name: str,
) -> dict[str, object]:
    module = import_module("domains.issue_filter.projection")
    extractor = module.extract_issue_evidence_labels
    return extractor(
        evidence,
        cluster_id=cluster_id,
        namespace=namespace,
        resource_kind=resource_kind,
        resource_name=resource_name,
    )


def test_rca_timeline_model_adds_nullable_issue_axes_and_honest_completeness() -> None:
    table = RcaTimeline.__table__

    for name in ("severity", "environment", "application_ids", "labels"):
        assert table.c[name].nullable is True
    assert isinstance(table.c.application_ids.type, JSONB)
    assert isinstance(table.c.labels.type, JSONB)

    for name in (
        "severity_complete",
        "environment_complete",
        "application_ids_complete",
        "labels_complete",
    ):
        column = table.c[name]
        assert isinstance(column.type, Boolean)
        assert column.nullable is False
        assert column.server_default is not None
        assert str(column.server_default.arg).lower() == "false"


def test_incident_event_projects_only_authoritative_issue_axes() -> None:
    row = timeline_update_from_event(_event("incident.detected", _incident_payload()))

    assert row is not None
    assert row["severity"] == "critical"
    assert row["severity_complete"] is True
    assert row["environment"] is None
    assert row["environment_complete"] is False
    assert row["application_ids"] is None
    assert row["application_ids_complete"] is False
    assert row["labels"] is None
    assert row["labels_complete"] is False


def test_legacy_incident_without_severity_is_explicitly_incomplete() -> None:
    row = timeline_update_from_event(_event("incident.detected", _incident_payload(severity=None)))

    assert row is not None
    assert row["severity"] is None
    assert row["severity_complete"] is False


class _Result:
    def first(self) -> None:
        return None


class _RecordingConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        return _Result()


def _repository(connection: _RecordingConnection) -> DashboardRepository:
    @contextmanager
    def recording_connection():
        yield connection

    repository = object.__new__(DashboardRepository)
    repository.connection = recording_connection  # type: ignore[method-assign]
    return repository


def test_followup_event_upsert_preserves_projection_value_and_completeness_atomically() -> None:
    connection = _RecordingConnection()
    row = timeline_update_from_event(
        _event(
            "safe_pr.created",
            {
                "workspace_id": "workspace-1",
                "cluster_id": "cluster-1",
                "pr_url": "https://github.example/pull/1",
            },
        )
    )
    assert row is not None

    _repository(connection).upsert_rca_timeline(row)

    compiled = connection.statements[0].compile(dialect=postgresql.dialect())
    sql = " ".join(str(compiled).lower().split())
    for name in ("severity", "environment", "application_ids", "labels"):
        assert f"{name} = case when" in sql
        assert f"rca_timeline.{name}_complete is true" in sql
        assert f"then rca_timeline.{name}" in sql
        assert f"excluded.{name}_complete is true" in sql
        assert f"then excluded.{name}" in sql
        assert f"{name} = coalesce(excluded.{name}, rca_timeline.{name})" not in sql

    assert "updated_at = case when" in sql
    assert "excluded.last_event_at > rca_timeline.last_event_at" in sql
    assert "excluded.last_event_id > rca_timeline.last_event_id" in sql


def test_evidence_labels_require_one_exact_event_time_resource_identity() -> None:
    result = _extract_issue_evidence_labels(
        {
            "cluster_id": "cluster-1",
            "kubernetes": {
                "workloads": [
                    {
                        "kind": "Deployment",
                        "namespace": "other",
                        "name": "checkout-api",
                        "labels": {"team": "wrong"},
                        "labels_complete": True,
                    },
                    {
                        "kind": "Deployment",
                        "namespace": "shop",
                        "name": "checkout-api",
                        "labels": {"app": "checkout", "team": "payments"},
                        "labels_complete": True,
                    },
                ]
            },
        },
        cluster_id="cluster-1",
        namespace="shop",
        resource_kind="Deployment",
        resource_name="checkout-api",
    )

    assert result == {
        "labels": {"app": "checkout", "team": "payments"},
        "labels_complete": True,
        "reason_code": None,
    }


def test_evidence_labels_are_bounded_and_propagate_source_incompleteness() -> None:
    labels = {f"key-{index:02d}": f"value-{index:02d}" for index in range(40)}

    result = _extract_issue_evidence_labels(
        {
            "cluster_id": "cluster-1",
            "kubernetes": {
                "workloads": [
                    {
                        "kind": "Deployment",
                        "namespace": "shop",
                        "name": "checkout-api",
                        "labels": labels,
                        "labels_complete": False,
                    }
                ]
            },
        },
        cluster_id="cluster-1",
        namespace="shop",
        resource_kind="Deployment",
        resource_name="checkout-api",
    )

    assert 0 < len(result["labels"]) <= 12
    assert result["labels_complete"] is False
    assert result["reason_code"] == "source_labels_incomplete"


def test_evidence_labels_preserve_valid_empty_kubernetes_values() -> None:
    result = _extract_issue_evidence_labels(
        {
            "cluster_id": "cluster-1",
            "kubernetes": {
                "workloads": [
                    {
                        "kind": "Deployment",
                        "namespace": "shop",
                        "name": "checkout-api",
                        "labels": {"feature-flag": "", "team": "payments"},
                        "labels_complete": True,
                    }
                ]
            },
        },
        cluster_id="cluster-1",
        namespace="shop",
        resource_kind="Deployment",
        resource_name="checkout-api",
    )

    assert result == {
        "labels": {"feature-flag": "", "team": "payments"},
        "labels_complete": True,
        "reason_code": None,
    }


def test_evidence_labels_fail_closed_for_ambiguous_or_legacy_snapshots() -> None:
    exact = {
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout-api",
        "labels": {"team": "payments"},
        "labels_complete": True,
    }
    ambiguous = _extract_issue_evidence_labels(
        {
            "cluster_id": "cluster-1",
            "kubernetes": {"workloads": [exact, dict(exact)]},
        },
        cluster_id="cluster-1",
        namespace="shop",
        resource_kind="Deployment",
        resource_name="checkout-api",
    )
    legacy = _extract_issue_evidence_labels(
        {
            "cluster_id": "cluster-1",
            "kubernetes": {
                "workloads": [
                    {key: value for key, value in exact.items() if key != "labels_complete"}
                ]
            },
        },
        cluster_id="cluster-1",
        namespace="shop",
        resource_kind="Deployment",
        resource_name="checkout-api",
    )

    assert ambiguous == {
        "labels": {},
        "labels_complete": False,
        "reason_code": "target_ambiguous",
    }
    assert legacy == {
        "labels": {},
        "labels_complete": False,
        "reason_code": "source_labels_completeness_unknown",
    }


def test_evidence_labels_reject_cross_cluster_or_missing_target() -> None:
    evidence = {
        "cluster_id": "cluster-other",
        "kubernetes": {
            "workloads": [
                {
                    "kind": "Deployment",
                    "namespace": "shop",
                    "name": "checkout-api",
                    "labels": {"team": "payments"},
                    "labels_complete": True,
                }
            ]
        },
    }

    result = _extract_issue_evidence_labels(
        evidence,
        cluster_id="cluster-1",
        namespace="shop",
        resource_kind="Deployment",
        resource_name="checkout-api",
    )

    assert result == {
        "labels": {},
        "labels_complete": False,
        "reason_code": "target_not_found",
    }
