"""Issues projection must derive tenancy only from the authenticated event envelope."""

from __future__ import annotations

from domains.dashboard.repository import timeline_update_from_event
from packages.contracts.event_bus.interfaces import EventEnvelope


def _event(*, envelope_workspace: str | None, payload_workspace: str) -> EventEnvelope:
    return EventEnvelope(
        event_id="event-tenancy-1",
        subject="incident.detected",
        source="incident-worker",
        correlation_id="correlation-tenancy-1",
        causation_id=None,
        created_at="2026-07-13T15:00:00Z",
        workspace_id=envelope_workspace,
        payload={
            "workspace_id": payload_workspace,
            "cluster_id": "cluster-1",
            "detected": True,
            "severity": "critical",
            "incident": {
                "incident_id": "incident-1",
                "cluster_id": "cluster-1",
                "resource_kind": "Deployment",
                "resource_name": "checkout-api",
                "namespace": "shop",
                "symptom": "CrashLoopBackOff",
            },
        },
    )


def test_issue_projection_rejects_payload_workspace_spoofing() -> None:
    row = timeline_update_from_event(
        _event(
            envelope_workspace="workspace-authenticated",
            payload_workspace="workspace-victim",
        )
    )

    assert row is None


def test_issue_projection_rejects_legacy_envelope_without_tenant_provenance() -> None:
    row = timeline_update_from_event(
        _event(envelope_workspace=None, payload_workspace="workspace-victim")
    )

    assert row is None


def test_issue_projection_uses_matching_envelope_workspace() -> None:
    row = timeline_update_from_event(
        _event(
            envelope_workspace="workspace-authenticated",
            payload_workspace="workspace-authenticated",
        )
    )

    assert row is not None
    assert row["workspace_id"] == "workspace-authenticated"
