from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from domains.rca.events import (
    EvidenceBundle,
    IncidentRecord,
    RcaAiFallbackRequestedBody,
)
from packages.contracts.event_bus.bodies.platform import DeadLetterCreatedBody


def test_dead_letter_monitor_requests_operational_alert() -> None:
    worker = load_service("projection/dead-letter-monitor")
    body = DeadLetterCreatedBody(
        dead_letter_id=7,
        original_event_id="evt-1",
        original_subject="command.requested",
        consumer="command-worker",
        attempts=3,
        error="handler failed",
        created_at="2026-07-05T00:00:00Z",
        status="open",
        correlation_id="corr-1",
    )

    outs = run_handler(worker.on_dead_letter_created, body)

    assert subjects_of(outs) == ["alert.requested"]
    assert outs[0].cluster_id == "management-plane"
    assert outs[0].namespace == "platform"
    assert outs[0].severity == "warning"
    assert outs[0].message == "dead letter captured for command.requested"


def test_rca_fallback_requests_followup_action() -> None:
    worker = load_service("ai/rca-feedback-worker")
    incident = IncidentRecord(
        incident_id="incident-1",
        cluster_id="target-cluster-01",
        resource_kind="deployment",
        resource_name="checkout-api",
        namespace="sandbox",
        symptom="UnknownFailure",
        severity="high",
        first_seen_at=None,
        summary="unknown deployment failure",
        workspace_id="workspace-1",
    )
    body = RcaAiFallbackRequestedBody(
        reason="no matching RCA rule",
        evidence_ref="evidence-1",
        incident=incident,
        evidence_bundle=EvidenceBundle(
            incident_id="incident-1",
            items=[],
            missing_evidence=["logs"],
            complete=False,
        ),
        missing_evidence=["logs"],
        workspace_id="workspace-1",
    )

    outs = run_handler(worker.on_ai_fallback_requested, body)

    assert subjects_of(outs) == ["rca.followup.required"]
    assert outs[0].evidence_ref == "evidence-1"
    assert outs[0].workspace_id == "workspace-1"
    assert outs[0].reason_code == "ai_fallback_required"
    assert outs[0].summary == "대표 증상에 맞는 RCA rule이 없어 AI fallback 검토가 필요합니다."
