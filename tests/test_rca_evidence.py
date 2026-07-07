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
PR_HTML_URL = f"{PR_URL_PREFIX}/7"


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
    if incident_outs[-1].__subject__ != "evidence.bundle.built":
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


def test_crashloop_flow_auto_selects_restart_and_queues_command() -> None:
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

    # rollout restart 는 비파괴 조치 — 승인 없이 자동 선택되어 명령 큐까지 도달해야 함.
    assert subjects_of(recovery_outs + select_outs) == [
        "recovery.planned",
        "recovery.action_selected",
    ]
    auto_selected = select_outs[0]
    assert auto_selected.auto_selected is True
    assert auto_selected.selected_by == "agent-select"
    assert auto_selected.selected.draft.params.get("command") == "rollout_restart"

    dispatch_outs = run_handler(
        dispatch_worker.on_recovery_action_selected,
        auto_selected,
    )
    assert subjects_of(dispatch_outs) == ["command.requested"]
    auto_command = dispatch_outs[0]
    assert auto_command.action == "rollout_restart"
    assert auto_command.namespace == "sandbox"
    assert auto_command.workspace_id == "workspace-1"
    assert auto_command.approval_ref is None
    assert auto_command.policy_decision_ref is None
    assert auto_command.actor["auto_selected"] is True

    queue_db = SpyDb()
    command_outs = run_handler(
        command_worker.on_command_requested,
        auto_command,
        db=queue_db,
        correlation_id="corr-auto-queue",
    )
    assert subjects_of(command_outs) == [
        "command.dispatched",
        "command.queued_for_agent",
    ]
    assert command_outs[0].plan.routing_constraint.required_capability == "command_receiver"
    assert queue_db.called("queue_agent_command")


def loki_log_entry(namespace: str, line: str, *, query_name: str = "namespace_errors") -> dict:
    """Loki provider(normalize_payload) 출력과 같은 모양의 로그 evidence 항목."""
    return {
        "source": "loki",
        "query_name": query_name,
        "query": f'{{k8s_namespace_name="{namespace}"}} |= "ERROR"',
        "result_type": "streams",
        "streams": [
            {
                "stream": {"k8s_namespace_name": namespace, "k8s_container_name": "app"},
                "values": [{"timestamp": "1751871600000000000", "line": line}],
            }
        ],
        "line_count": 1,
    }


def test_evidence_bundle_keeps_only_incident_namespace_log_streams() -> None:
    """incident 리소스(sandbox)의 로그만 근거로 남고 target 네임스페이스 노이즈는 제외된다."""
    db = SpyDb()
    payload = crashloop_payload(
        logs=[
            loki_log_entry("target", "ERROR loki querier internal noise"),
            loki_log_entry(
                "sandbox", "FATAL: required environment variable DATABASE_URL is not set"
            ),
        ],
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-ns-filter")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    logs_item = next(item for item in bundle.items if item.source == "logs")
    namespaces = {
        stream["stream"]["k8s_namespace_name"]
        for entry in logs_item.value["entries"]
        for stream in entry["streams"]
    }
    assert namespaces == {"sandbox"}
    # target 노이즈가 빠진 로그로 판별 — env 누락 FATAL 로그가 config_env_error 를 만든다.
    completed = event_by_subject(rca_events, "rca.completed")
    assert completed.root_cause == "config_env_error"
    assert completed.root_cause != "oom_killed"


def test_target_namespace_only_logs_do_not_count_as_workload_evidence() -> None:
    """다른 네임스페이스(target) 로그뿐이면 logs 근거가 빠져 완결 대신 blocked 로 흐른다."""
    db = SpyDb()
    payload = crashloop_payload(
        logs=[loki_log_entry("target", "ERROR loki querier internal noise")],
        traces={},
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-ns-noise")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    assert all(item.source != "logs" for item in bundle.items)
    assert rca_events[-1].__subject__ == "rca.analysis_blocked"
    assert not db.called("save_rca_report")


def test_duplicate_rca_report_in_window_is_not_saved_again() -> None:
    """dedup — 같은 (workspace, root_cause, 리소스) 리포트가 창 안에 있으면 저장 생략."""
    db = SpyDb(
        find_recent_rca_report={
            "id": 1,
            "correlation_id": "corr-earlier",
            "created_at": "2026-07-07T09:00:00+00:00",
        }
    )

    rca_events = run_to_rca(crashloop_payload(), db=db, correlation_id="corr-dup")

    # rca.completed 이벤트는 그대로 발행된다 — 저장(INSERT)만 생략된다.
    assert rca_events[-1].__subject__ == "rca.completed"
    assert not db.called("save_rca_report")
    lookup = next(c for c in db.calls if c[0] == "find_recent_rca_report")
    workspace_id, root_cause, resource_key, window_seconds = lookup[1]
    assert workspace_id == "workspace-1"
    assert root_cause == rca_events[-1].root_cause
    assert resource_key == "sandbox/deployment/checkout-api"
    assert window_seconds > 0


def test_no_incident_flow_stops_before_rca_analysis() -> None:
    db = SpyDb()

    events = run_to_rca(empty_payload(), db=db, correlation_id="corr-empty")

    assert subjects_of(events) == [
        "evidence.built",
        "incident.detected",
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
        "rca.analysis_blocked",
    ]
    planned = event_by_subject(rca_events, "rca.candidates.planned")
    evaluated = event_by_subject(rca_events, "rca.candidates.evaluated")
    blocked = event_by_subject(rca_events, "rca.analysis_blocked")
    assert planned.candidate_count == 0
    assert planned.rule_missing.message == "정의된 RCA rule 없음"
    assert evaluated.evaluations[0].candidate_id == "unknown"
    assert evaluated.evaluations[0].score == 0.0
    assert evaluated.evaluations[0].missing_evidence == ["matching_cause_rule"]
    assert blocked.reason_code == "rule_missing"
    assert blocked.rca_detail.root_cause == "unknown"
    assert blocked.rca_detail.missing_evidence == ["matching_cause_rule"]
    assert blocked.missing_evidence == ["matching_cause_rule"]

    backlog_worker = load_service("ai/backlog-worker")
    backlog_db = SpyDb()
    run_handler(
        backlog_worker.on_rca_backlog_item_created,
        event_by_subject(rca_events, "rca.backlog.created"),
        db=backlog_db,
        correlation_id="corr-unknown",
    )
    assert backlog_db.called("upsert_rca_backlog_item")

    feedback_worker = load_service("ai/rca-feedback-worker")
    feedback_outs = run_handler(
        feedback_worker.on_rca_analysis_blocked,
        blocked,
    )

    assert subjects_of(feedback_outs) == ["rca.followup.required"]
    assert feedback_outs[0].missing_evidence == ["matching_cause_rule"]
    assert feedback_outs[0].next_actions[0]["action_type"] == "collect_evidence"


def test_user_selected_safe_pr_flow_requires_concrete_patch(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    monkeypatch.setenv("SCM_REPO", "project/repo")
    db = SpyDb()
    recovery_worker = load_service("ai/recovery-worker")
    select_worker = load_service("ai/select-worker")
    approval_worker = load_service("ai/approval-worker")
    dispatch_worker = load_service("ai/dispatch-worker")

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

    assert subjects_of(recovery_outs + select_outs + approval_outs + dispatch_outs) == [
        "recovery.planned",
        "recovery.selection_requested",
        "approval.recommended",
        "rca.action_required",
    ]
    assert dispatch_outs[0].reason_code == "safe_pr_patch_missing"
    assert not db.called("save_pull_request")


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
    assert rollout_outs[0].diagnosis == "kubernetes api not configured; dry-run only"
