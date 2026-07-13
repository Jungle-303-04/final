"""dashboard worker의 event-time issue label projection."""

from __future__ import annotations

from conftest import SpyDb, load_service, run_handler

from packages.contracts.event_bus.interfaces import EventEnvelope


def _incident_event() -> EventEnvelope:
    return EventEnvelope(
        event_id="event-1",
        subject="incident.detected",
        source="incident-worker",
        correlation_id="correlation-1",
        causation_id=None,
        created_at="2026-07-13T14:00:00Z",
        workspace_id="workspace-1",
        payload={
            "workspace_id": "workspace-1",
            "cluster_id": "cluster-1",
            "detected": True,
            "severity": "critical",
            "incident": {
                "incident_id": "incident-1",
                "cluster_id": "cluster-1",
                "namespace": "shop",
                "resource_kind": "Deployment",
                "resource_name": "checkout-api",
                "symptom": "CrashLoopBackOff",
            },
        },
    )


def test_dashboard_worker_projects_labels_from_stored_event_time_evidence() -> None:
    dashboard = load_service("projection/dashboard-worker")
    db = SpyDb(
        get_evidence_payload={
            "cluster_id": "cluster-1",
            "kubernetes": {
                "workloads": [
                    {
                        "kind": "Deployment",
                        "namespace": "shop",
                        "name": "checkout-api",
                        "labels": {"app": "checkout", "team": "payments"},
                        "labels_complete": True,
                    }
                ]
            },
        }
    )

    assert run_handler(dashboard.on_event, _incident_event(), db=db) == []

    assert db.calls[0] == (
        "get_evidence_payload",
        ("workspace-1", "correlation-1", "rca_bundle"),
    )
    assert db.calls[1][0] == "upsert_rca_timeline"
    row = db.calls[1][1][0]
    assert row["labels"] == {"app": "checkout", "team": "payments"}
    assert row["labels_complete"] is True


def test_dashboard_worker_keeps_timeline_projection_when_evidence_lookup_fails() -> None:
    dashboard = load_service("projection/dashboard-worker")

    class FailingEvidenceDb(SpyDb):
        async def get_evidence_payload(
            self,
            workspace_id: str,
            correlation_id: str,
            kind: str,
        ) -> None:
            self.calls.append(("get_evidence_payload", (workspace_id, correlation_id, kind)))
            raise RuntimeError("evidence store unavailable")

    db = FailingEvidenceDb()

    assert run_handler(dashboard.on_event, _incident_event(), db=db) == []

    assert [name for name, _args in db.calls] == [
        "get_evidence_payload",
        "upsert_rca_timeline",
    ]
    row = db.calls[1][1][0]
    assert row["labels"] is None
    assert row["labels_complete"] is False
