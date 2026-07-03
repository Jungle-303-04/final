from __future__ import annotations

from typing import Any

from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.command.events import CommandCompletedBody
from domains.rca.events import (
    ClusterEvidenceReceivedBody,
    Evidence,
    EvidenceBundle,
    IncidentRecord,
    RcaCompletedBody,
    RcaReportDetail,
    RecoveryActionSelectedBody,
)

PR_URL_PREFIX = "https://github.test.local/project/repo/pull"


def crashloop_payload(
    *,
    symptom: str = "CrashLoopBackOff",
    resource_kind: str = "deployment",
    resource_name: str = "checkout-api",
    namespace: str = "sandbox",
    metrics: dict[str, Any] | None = None,
    logs: list[dict[str, Any]] | None = None,
    traces: dict[str, Any] | None = None,
) -> ClusterEvidenceReceivedBody:
    return ClusterEvidenceReceivedBody(
        cluster_id="target-cluster-01",
        workspace_id="workspace-1",
        kubernetes={
            "resource": {
                "kind": resource_kind,
                "name": resource_name,
                "namespace": namespace,
            },
            "pods": [{"name": resource_name, "status": symptom}],
            "symptom": symptom,
            "severity": "high",
        },
        metrics=metrics if metrics is not None else {"memory": "near-limit"},
        logs=logs if logs is not None else [{"line": "OOMKilled"}],
        traces=traces if traces is not None else {"slow_span": "GET /checkout"},
    )


def empty_payload() -> ClusterEvidenceReceivedBody:
    return ClusterEvidenceReceivedBody(
        cluster_id="target-cluster-01",
        workspace_id="workspace-1",
        kubernetes={},
        metrics={},
        logs=[],
        traces={},
    )


def event_by_subject(events: list[Any], subject: str) -> Any:
    return next(event for event in events if event.__subject__ == subject)


def run_to_rca(
    payload: ClusterEvidenceReceivedBody,
    *,
    db: SpyDb,
    correlation_id: str,
) -> list[Any]:
    evidence_worker = load_service("ai/evidence-worker")
    incident_worker = load_service("ai/incident-worker")
    plan_worker = load_service("ai/plan-worker")
    analyze_worker = load_service("ai/analyze-worker")
    rca_worker = load_service("ai/rca-worker")

    evidence_outs = run_handler(
        evidence_worker.on_cluster_evidence,
        payload,
        db=db,
        correlation_id=correlation_id,
    )
    incident_outs = run_handler(
        incident_worker.on_evidence_built,
        evidence_outs[0],
        db=db,
        correlation_id=correlation_id,
    )
    if incident_outs[-1].__subject__ == "rca.action_required":
        return evidence_outs + incident_outs

    plan_outs = run_handler(
        plan_worker.on_evidence_bundle_built,
        incident_outs[-1],
    )
    analyze_outs = run_handler(
        analyze_worker.on_candidates_planned,
        plan_outs[-1],
    )
    rca_outs = run_handler(
        rca_worker.on_candidates_evaluated,
        analyze_outs[0],
        db=db,
        correlation_id=correlation_id,
    )
    return evidence_outs + incident_outs + plan_outs + analyze_outs + rca_outs


def report_for(root_cause: str) -> RcaCompletedBody:
    incident = IncidentRecord(
        incident_id="inc-safe-pr",
        cluster_id="target-cluster-01",
        resource_kind="deployment",
        resource_name="checkout-api",
        namespace="sandbox",
        symptom="CrashLoopBackOff",
        severity="high",
        first_seen_at=None,
        summary="deployment checkout-api has CrashLoopBackOff",
        workspace_id="workspace-1",
    )
    detail = RcaReportDetail(
        root_cause=root_cause,
        confidence=0.91,
        selected_candidate_id=root_cause,
        supporting_evidence=["kubernetes", "logs"],
        missing_evidence=[],
        reason=f"{root_cause} selected by deep flow test",
    )
    return RcaCompletedBody(
        root_cause=root_cause,
        action="plan_recovery",
        evidence_ref="object://evidence/corr-safe-pr.json",
        workspace_id="workspace-1",
        evidence=Evidence(
            cluster_id="target-cluster-01",
            kubernetes={},
            metrics={},
            logs=[],
            traces={},
            object_ref="object://evidence/corr-safe-pr.json",
            workspace_id="workspace-1",
        ),
        incident=incident,
        evidence_bundle=EvidenceBundle(
            incident_id=incident.incident_id,
            items=[],
            missing_evidence=[],
            complete=True,
        ),
        rca_detail=detail,
    )


def test_crashloop_flow_reaches_auto_command_queue() -> None:
    db = SpyDb()

    rca_events = run_to_rca(crashloop_payload(), db=db, correlation_id="corr-auto")

    assert subjects_of(rca_events) == [
        "evidence.built",
        "incident.detected",
        "evidence.bundle.built",
        "rca.candidates.planned",
        "rca.candidates.evaluated",
        "rca.completed",
    ]
    assert db.called("save_evidence")
    assert db.called("save_rca_report")

    detected = event_by_subject(rca_events, "incident.detected")
    assert detected.detected is True
    assert detected.incident.symptom == "CrashLoopBackOff"
    assert detected.affected[0]["workspace_id"] == "workspace-1"

    planned = event_by_subject(rca_events, "rca.candidates.planned")
    assert planned.candidate_count == 5
    assert [candidate.candidate_id for candidate in planned.candidates][:2] == [
        "oom_killed",
        "bad_image_rollout",
    ]

    completed = event_by_subject(rca_events, "rca.completed")
    assert completed.root_cause == "oom_killed"
    assert completed.rca_detail.confidence == 1.0

    recovery_worker = load_service("ai/recovery-worker")
    select_worker = load_service("ai/select-worker")
    dispatch_worker = load_service("ai/dispatch-worker")
    command_worker = load_service("command/command-worker")

    recovery_outs = run_handler(
        recovery_worker.on_rca_completed,
        completed,
    )
    select_outs = run_handler(
        select_worker.on_recovery_planned,
        recovery_outs[0],
    )
    dispatch_outs = run_handler(
        dispatch_worker.on_recovery_action_selected,
        select_outs[0],
    )

    assert subjects_of(recovery_outs + select_outs + dispatch_outs) == [
        "recovery.planned",
        "recovery.action_selected",
        "command.requested",
    ]
    command = dispatch_outs[0]
    assert command.action == "rollout_restart"
    assert command.namespace == "sandbox"
    assert command.workspace_id == "workspace-1"

    queue_db = SpyDb()
    command_outs = run_handler(
        command_worker.on_command_requested,
        command,
        db=queue_db,
        correlation_id="corr-auto",
    )
    assert subjects_of(command_outs) == [
        "command.dispatch.ready",
        "command.dispatched",
        "command.queued_for_agent",
    ]
    assert command_outs[0].plan.routing_constraint.required_capability == "command_receiver"
    assert queue_db.called("queue_agent_command")


def test_no_incident_flow_stops_before_rca_analysis() -> None:
    db = SpyDb()

    events = run_to_rca(empty_payload(), db=db, correlation_id="corr-empty")

    assert subjects_of(events) == [
        "evidence.built",
        "incident.detected",
        "rca.action_required",
    ]
    assert event_by_subject(events, "incident.detected").detected is False
    assert db.called("save_evidence")
    assert not db.called("save_rca_report")


def test_unknown_symptom_creates_backlog_and_manual_selection_flow() -> None:
    db = SpyDb()
    payload = crashloop_payload(
        symptom="UnmappedSymptom",
        metrics={"cpu": 0.8},
        logs=[],
        traces={},
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-unknown")

    assert subjects_of(rca_events) == [
        "evidence.built",
        "incident.detected",
        "evidence.bundle.built",
        "rca.rule_missing",
        "rca.backlog.created",
        "rca.ai_fallback.requested",
        "rca.candidates.planned",
        "rca.candidates.evaluated",
        "rca.completed",
    ]
    planned = event_by_subject(rca_events, "rca.candidates.planned")
    evaluated = event_by_subject(rca_events, "rca.candidates.evaluated")
    completed = event_by_subject(rca_events, "rca.completed")
    assert planned.candidate_count == 0
    assert planned.rule_missing.message == "정의된 RCA rule 없음"
    assert evaluated.evaluations[0].candidate_id == "unknown"
    assert evaluated.evaluations[0].score == 0.0
    assert evaluated.evaluations[0].missing_evidence == ["matching_cause_rule"]
    assert completed.root_cause == "unknown"
    assert completed.rca_detail.missing_evidence == ["matching_cause_rule"]

    backlog_worker = load_service("ai/backlog-worker")
    backlog_db = SpyDb()
    run_handler(
        backlog_worker.on_rca_backlog_item_created,
        event_by_subject(rca_events, "rca.backlog.created"),
        db=backlog_db,
        correlation_id="corr-unknown",
    )
    assert backlog_db.called("upsert_rca_backlog_item")

    recovery_worker = load_service("ai/recovery-worker")
    select_worker = load_service("ai/select-worker")
    approval_worker = load_service("ai/approval-worker")
    recovery_outs = run_handler(
        recovery_worker.on_rca_completed,
        completed,
    )
    select_outs = run_handler(
        select_worker.on_recovery_planned,
        recovery_outs[0],
    )
    approval_outs = run_handler(
        approval_worker.on_recovery_selection_requested,
        select_outs[0],
    )

    assert subjects_of(recovery_outs + select_outs + approval_outs) == [
        "recovery.planned",
        "recovery.selection_requested",
        "approval.recommended",
    ]
    assert approval_outs[0].recommendation == "user_selection_required"


def test_user_selected_safe_pr_flow_reaches_patch_diff_and_scm(monkeypatch) -> None:
    monkeypatch.setenv("SCM_PR_URL_PREFIX", PR_URL_PREFIX)
    db = SpyDb()
    recovery_worker = load_service("ai/recovery-worker")
    select_worker = load_service("ai/select-worker")
    approval_worker = load_service("ai/approval-worker")
    dispatch_worker = load_service("ai/dispatch-worker")
    safe_pr_worker = load_service("ai/safe-pr-worker")
    diff_worker = load_service("ai/diff-worker")
    scm_worker = load_service("gitops/scm-worker")

    recovery_outs = run_handler(
        recovery_worker.on_rca_completed,
        report_for("bad_image_rollout"),
    )
    select_outs = run_handler(
        select_worker.on_recovery_planned,
        recovery_outs[0],
    )
    approval_outs = run_handler(
        approval_worker.on_recovery_selection_requested,
        select_outs[0],
    )
    plan = recovery_outs[0].plan
    selected = plan.candidates[0]
    action_selected = RecoveryActionSelectedBody(
        plan=plan,
        selected=selected,
        selected_by="operator",
        auto_selected=False,
        reason="operator approved rollback PR",
        workspace_id="workspace-1",
    )
    dispatch_outs = run_handler(
        dispatch_worker.on_recovery_action_selected,
        action_selected,
    )
    patch_outs = run_handler(
        safe_pr_worker.on_safe_pr_requested,
        dispatch_outs[0],
    )
    diff_outs = run_handler(
        diff_worker.on_safe_pr_patch_prepared,
        patch_outs[0],
    )
    scm_outs = run_handler(
        scm_worker.on_safe_pr_requested,
        dispatch_outs[0],
        db=db,
        correlation_id="corr-safe-pr",
    )

    assert subjects_of(
        recovery_outs + select_outs + approval_outs + dispatch_outs + patch_outs + diff_outs
    ) == [
        "recovery.planned",
        "recovery.selection_requested",
        "approval.recommended",
        "safe_pr.requested",
        "safe_pr.patch_prepared",
        "diff.explained",
    ]
    assert dispatch_outs[0].provider == "github"
    assert patch_outs[0].patch["provider"] == "github"
    assert diff_outs[0].risk == "review_required"
    assert subjects_of(scm_outs) == ["safe_pr.created"]
    assert scm_outs[0].pr_url.startswith(PR_URL_PREFIX)
    assert db.called("save_pull_request")


def test_rollout_completion_flows_to_approval_recommendation() -> None:
    rollout_worker = load_service("ai/rollout-worker")
    approval_worker = load_service("ai/approval-worker")
    command_completed = CommandCompletedBody(
        command_id="cmd-1",
        result={
            "status": "completed",
            "applied": False,
            "message": "kubernetes api not configured; dry-run only",
            "workspace_id": "workspace-1",
        },
    )

    rollout_outs = run_handler(
        rollout_worker.on_command_completed,
        command_completed,
    )
    approval_outs = run_handler(
        approval_worker.on_rollout_diagnosed,
        rollout_outs[0],
    )

    assert subjects_of(rollout_outs + approval_outs) == [
        "rollout.diagnosed",
        "approval.recommended",
    ]
    assert approval_outs[0].recommendation == "manual_review"
