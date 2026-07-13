from __future__ import annotations

from dataclasses import replace

from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.rca.events import (
    CauseCandidate,
    Evidence,
    EvidenceBundle,
    EvidenceItem,
    IncidentRecord,
    RcaCandidatesEvaluatedBody,
    RcaCandidatesPlannedBody,
)
from packages.contracts.event_bus.bodies.platform import PipelineContractFailedBody


def _incident(symptom: str = "CrashLoopBackOff") -> IncidentRecord:
    return IncidentRecord(
        incident_id="incident-1",
        cluster_id="cluster-1",
        resource_kind="Deployment",
        resource_name="checkout-api",
        namespace="sandbox",
        symptom=symptom,
        severity="high",
        first_seen_at=None,
        summary=f"checkout-api has {symptom}",
        workspace_id="workspace-1",
    )


def _evidence() -> Evidence:
    return Evidence(
        cluster_id="cluster-1",
        kubernetes={"symptom": "CrashLoopBackOff"},
        metrics={},
        logs=[],
        traces={},
        object_ref="object://evidence/corr-1.json",
        workspace_id="workspace-1",
    )


def _bundle() -> EvidenceBundle:
    return EvidenceBundle(
        incident_id="incident-1",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={"pod": "CrashLoopBackOff"},
                summary="pod is crash looping",
            )
        ],
        missing_evidence=["metrics", "logs"],
        complete=False,
    )


def test_context_contract_failure_becomes_followup_required() -> None:
    analyze_worker = load_service("ai/analyze-worker")
    feedback_worker = load_service("ai/rca-feedback-worker")
    planned = RcaCandidatesPlannedBody(
        candidate_count=1,
        evidence_ref="object://evidence/corr-1.json",
        candidates=[],
        workspace_id="workspace-1",
        evidence_bundle=None,
    )

    analyze_outs = run_handler(analyze_worker.on_candidates_planned, planned)
    feedback_outs = run_handler(feedback_worker.on_pipeline_contract_failed, analyze_outs[0])

    assert subjects_of(analyze_outs) == ["pipeline.contract_failed"]
    assert isinstance(analyze_outs[0], PipelineContractFailedBody)
    assert analyze_outs[0].contract == "RcaCandidatesPlannedBody.evidence_bundle"
    assert subjects_of(feedback_outs) == ["rca.followup.required"]
    assert feedback_outs[0].reason_code == "context_missing"
    assert (
        feedback_outs[0].summary
        == "worker 간 이벤트 payload에 필수 RCA context가 없어 분석을 진행하지 못했습니다."
    )
    assert feedback_outs[0].severity == "warning"
    assert feedback_outs[0].next_actions[0]["action_type"] == "fix_pipeline_contract"


def test_insufficient_candidate_evidence_is_blocked_not_completed() -> None:
    analyze_worker = load_service("ai/analyze-worker")
    rca_worker = load_service("ai/rca-worker")
    feedback_worker = load_service("ai/rca-feedback-worker")
    candidate = CauseCandidate(
        candidate_id="app_startup_failure",
        title="app startup failure",
        description="startup failed",
        expected_evidence=["kubernetes", "logs"],
        checks=["logs show startup error"],
    )
    planned = RcaCandidatesPlannedBody(
        candidate_count=1,
        evidence_ref="object://evidence/corr-1.json",
        candidates=[candidate],
        workspace_id="workspace-1",
        evidence=_evidence(),
        incident=_incident(),
        evidence_bundle=_bundle(),
    )

    evaluated = run_handler(analyze_worker.on_candidates_planned, planned)[0]
    rca_outs = run_handler(
        rca_worker.on_candidates_evaluated,
        evaluated,
        db=SpyDb(),
        correlation_id="corr-1",
    )
    feedback_outs = run_handler(feedback_worker.on_rca_analysis_blocked, rca_outs[0])

    assert subjects_of(rca_outs) == ["rca.analysis_blocked"]
    assert rca_outs[0].reason_code == "insufficient_evidence"
    assert rca_outs[0].rca_detail.missing_evidence == ["logs"]
    assert rca_outs[0].rca_detail.missing_evidence_checks[0].check_id
    assert subjects_of(feedback_outs) == ["rca.followup.required", "recovery.planned"]
    assert (
        feedback_outs[0].summary
        == "원인 후보는 있지만 필요한 근거가 부족해 자동 RCA 확정을 중단했습니다."
    )
    assert feedback_outs[0].missing_evidence == ["logs"]
    assert feedback_outs[0].next_actions[0]["action_type"] == "collect_evidence"
    assert (
        feedback_outs[0].next_actions[0]["description"]
        == "관련 Pod 로그를 수집한 뒤 RCA 평가를 재실행합니다."
    )
    assert feedback_outs[1].plan.selection_required is True
    assert feedback_outs[1].plan.candidates[0].approval_required is True
    assert feedback_outs[1].plan.candidates[0].draft.params["analysis_blocked_fallback"] is True


def test_no_candidate_analysis_is_blocked_and_does_not_save_report() -> None:
    rca_worker = load_service("ai/rca-worker")
    feedback_worker = load_service("ai/rca-feedback-worker")
    evaluated = RcaCandidatesEvaluatedBody(
        candidate_count=0,
        evidence_ref="object://evidence/corr-1.json",
        candidates=[],
        evaluations=[],
        workspace_id="workspace-1",
        evidence=_evidence(),
        incident=replace(_incident(), symptom="UnmappedSymptom"),
        evidence_bundle=EvidenceBundle(
            incident_id="incident-1",
            items=[],
            missing_evidence=["matching_cause_rule"],
            complete=False,
        ),
    )
    db = SpyDb()

    rca_outs = run_handler(
        rca_worker.on_candidates_evaluated,
        evaluated,
        db=db,
        correlation_id="corr-1",
    )
    feedback_outs = run_handler(feedback_worker.on_rca_analysis_blocked, rca_outs[0])

    assert subjects_of(rca_outs) == ["rca.analysis_blocked"]
    assert rca_outs[0].reason_code == "no_evaluation"
    assert not db.called("save_rca_report")
    assert subjects_of(feedback_outs) == ["rca.followup.required"]
    assert (
        feedback_outs[0].summary
        == "평가 가능한 원인 후보가 없어 root cause를 선택하지 못했습니다."
    )
