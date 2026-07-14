from __future__ import annotations

from typing import Any

from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.command.events import CommandCompletedBody
from domains.gitops.events import GitOpsChangeContextDetectedBody
from domains.rca.events import (
    CauseCandidate,
    ClusterEvidenceReceivedBody,
    Evidence,
    EvidenceBundle,
    EvidenceItem,
    IncidentRecord,
    RcaAnalysisBlockedBody,
    RcaCompletedBody,
    RcaReportDetail,
    RecoveryActionSelectedBody,
    compact_cluster_evidence_payload,
)
from packages.config.constants import Command
from services.ai.agent.pipeline.evidence import EVIDENCE_LINEAGE_KEY, EvidenceBuilder
from services.ai.agent.pipeline.evidence_bundle import MAX_LOG_ENTRIES, MAX_TEXT_LENGTH
from services.ai.agent.recovery.dispatch import command_diff_resource, command_target_name

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
    source_id: str | None = None,
    window_start: str | None = None,
    metadata: dict[str, Any] | None = None,
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
        source_id=source_id,
        window_start=window_start,
        metadata=metadata if metadata is not None else {},
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


def test_evidence_worker_hydrates_reference_event_from_window_payload() -> None:
    evidence_worker = load_service("ai/evidence-worker")
    full_payload = crashloop_payload(
        source_id="cluster-snapshot",
        window_start="window-1",
    )
    full_payload = ClusterEvidenceReceivedBody.from_body(
        {
            **full_payload.to_body(),
            "evidence_key": "workspace-1:cluster-1:cluster-snapshot:window-1",
        }
    )
    reference_payload = ClusterEvidenceReceivedBody.from_body(
        compact_cluster_evidence_payload(full_payload, "corr-ref")
    )
    db = SpyDb(get_evidence_window_payload=full_payload.to_body())

    outs = run_handler(
        evidence_worker.on_cluster_evidence,
        reference_payload,
        db=db,
        correlation_id="corr-ref",
    )

    assert subjects_of(outs) == ["evidence.built"]
    evidence = outs[0].evidence
    assert evidence.kubernetes == {}
    assert evidence.metrics == {}
    assert evidence.logs == []
    assert outs[0].summary["resource"]["name"] == "checkout-api"
    assert outs[0].payload_size > 0
    assert db.called("get_evidence_window_payload")


def test_evidence_worker_accepts_legacy_full_payload_event() -> None:
    evidence_worker = load_service("ai/evidence-worker")
    full_payload = crashloop_payload()
    db = SpyDb()

    outs = run_handler(
        evidence_worker.on_cluster_evidence,
        full_payload,
        db=db,
        correlation_id="corr-full",
    )

    assert subjects_of(outs) == ["evidence.built"]
    evidence = outs[0].evidence
    assert evidence.kubernetes == {}
    assert evidence.metrics == {}
    assert evidence.logs == []
    assert outs[0].payload_size > 0
    assert outs[0].summary["resource"]["name"] == "checkout-api"
    assert db.called("save_evidence")
    assert not db.called("get_evidence_window_payload")


def test_evidence_worker_persists_gitops_change_context_event() -> None:
    evidence_worker = load_service("ai/evidence-worker")
    payload = GitOpsChangeContextDetectedBody(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        repository_id="repo-1",
        commit_sha="abc123",
        manifest_path="deploy/checkout-api.yaml",
        resource="deployment/checkout-api",
        metadata={
            "change_context": {
                "gitops": {"repository_id": "repo-1", "commit_sha": "abc123"},
                "recent_changes": [{"change_type": "image", "field": "image"}],
            }
        },
    )
    db = SpyDb()

    outs = run_handler(
        evidence_worker.on_gitops_change_context,
        payload,
        db=db,
        correlation_id="corr-gitops-context",
    )

    assert outs == []
    assert db.calls[0][0] == "save_evidence"
    assert db.calls[0][1][0] == "corr-gitops-context"
    assert db.calls[0][1][1] == "workspace-1"
    assert db.calls[0][1][2] == "gitops_change_context"
    assert db.calls[0][1][3]["metadata"]["change_context"]["gitops"]["commit_sha"] == "abc123"


def test_evidence_worker_joins_recent_gitops_change_context_into_evidence() -> None:
    evidence_worker = load_service("ai/evidence-worker")
    payload = crashloop_payload(window_start="2026-07-13T02:33:30+00:00")
    db = SpyDb(
        list_recent_workload_changes_for_evidence=[
            {
                "event_id": "evt-change-1",
                "changed_at": "2026-07-13T02:30:00+00:00",
                "image_before": "repo/checkout:v1",
                "image_after": "repo/checkout:v2",
                "pr_url": "https://github.test.local/project/repo/pull/7",
                "commit_sha": "abc123",
                "repository_id": "repo-1",
                "repo_ref": "project/repo",
                "workflow_run_id": "run-1",
                "namespace": "sandbox",
                "resource_kind": "deployment",
                "resource_name": "checkout-api",
                "manifest_path": "deploy/checkout.yaml",
            }
        ]
    )

    outs = run_handler(
        evidence_worker.on_cluster_evidence,
        payload,
        db=db,
        correlation_id="corr-gitops-join",
    )

    assert subjects_of(outs) == ["evidence.built"]
    call = next(call for call in db.calls if call[0] == "list_recent_workload_changes_for_evidence")
    assert call[1] == (
        "workspace-1",
        "target-cluster-01",
        "sandbox",
        "deployment",
        "checkout-api",
        "2026-07-13T02:33:30+00:00",
    )
    saved = next(call for call in db.calls if call[0] == "save_evidence")[1][3]
    change_context = saved["metadata"]["change_context"]
    assert change_context["gitops"]["commit_sha"] == "abc123"
    assert change_context["image"] == {
        "previous": "repo/checkout:v1",
        "current": "repo/checkout:v2",
        "changed": True,
    }
    assert change_context["recent_changes"][0]["change_type"] == "image"
    assert change_context["recent_changes"][0]["target_resource"] == "deployment/checkout-api"


def test_incident_worker_hydrates_reference_evidence_built_event() -> None:
    evidence_worker = load_service("ai/evidence-worker")
    incident_worker = load_service("ai/incident-worker")
    db = SpyDb()

    evidence_outs = run_handler(
        evidence_worker.on_cluster_evidence,
        crashloop_payload(),
        db=db,
        correlation_id="corr-built-ref",
    )
    incident_outs = run_handler(
        incident_worker.on_evidence_built,
        evidence_outs[0],
        db=db,
        correlation_id="corr-built-ref",
    )

    assert subjects_of(incident_outs) == ["incident.detected", "evidence.bundle.built"]
    detected = incident_outs[0]
    assert detected.detected is True
    assert detected.incident.symptom == "CrashLoopBackOff"
    assert db.called("get_evidence_payload")


def report_for(
    root_cause: str,
    *,
    resource_kind: str = "deployment",
    resource_name: str = "checkout-api",
) -> RcaCompletedBody:
    incident = IncidentRecord(
        incident_id="inc-safe-pr",
        cluster_id="target-cluster-01",
        resource_kind=resource_kind,
        resource_name=resource_name,
        namespace="sandbox",
        symptom="CrashLoopBackOff",
        severity="high",
        first_seen_at=None,
        summary=f"{resource_kind} {resource_name} has CrashLoopBackOff",
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
    assert planned.candidate_count == 7
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
    assert "자동 선택 조건을 충족했습니다" in auto_selected.reason
    assert "route=auto" in auto_selected.reason
    assert "approval_required=false" in auto_selected.reason
    assert f"후보={auto_selected.selected.action_id}" in auto_selected.reason

    dispatch_outs = run_handler(
        dispatch_worker.on_recovery_action_selected,
        auto_selected,
    )
    assert subjects_of(dispatch_outs) == ["command.requested"]
    auto_command = dispatch_outs[0]
    assert auto_command.action == "rollout_restart"
    assert auto_command.namespace == "sandbox"
    assert auto_command.diff.resource == "deployment/checkout-api"
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


def test_application_5xx_recovery_requires_gitops_pr_and_keeps_scale_fallback() -> None:
    recovery_worker = load_service("ai/recovery-worker")
    select_worker = load_service("ai/select-worker")
    dispatch_worker = load_service("ai/dispatch-worker")

    recovery_outs = run_handler(
        recovery_worker.on_rca_completed,
        report_for("application_5xx_spike"),
    )
    plan = recovery_outs[0].plan

    assert [candidate.draft.action_type for candidate in plan.candidates[:3]] == [
        "replica_scale",
        "gitops_recovery_review",
        "deployment_scale",
    ]
    assert plan.selection_required is True

    select_outs = run_handler(select_worker.on_recovery_planned, recovery_outs[0])
    assert subjects_of(select_outs) == ["recovery.selection_requested"]
    assert "사용자 선택이 필요합니다" in select_outs[0].reason
    assert f"후보={plan.candidates[0].action_id}" in select_outs[0].reason
    assert f"route={plan.candidates[0].route}" in select_outs[0].reason

    scale_candidate = plan.candidates[2]
    dispatch_outs = run_handler(
        dispatch_worker.on_recovery_action_selected,
        RecoveryActionSelectedBody(
            plan=plan,
            selected=scale_candidate,
            selected_by="operator-1",
            auto_selected=False,
            reason="operator selected scale",
            workspace_id="workspace-1",
        ),
    )

    scale_command = dispatch_outs[0]
    assert scale_command.action == "k8s.apps.v1.deployments.scale"
    assert scale_command.namespace == "sandbox"
    assert scale_command.diff.resource == "deployment/checkout-api"
    assert scale_command.payload == {
        "namespace": "sandbox",
        "name": "checkout-api",
        "replicas": 3,
    }


def test_approval_required_recovery_dispatch_explains_manual_reason() -> None:
    recovery_worker = load_service("ai/recovery-worker")
    dispatch_worker = load_service("ai/dispatch-worker")

    recovery_outs = run_handler(
        recovery_worker.on_rca_completed,
        report_for("missing_image_pull_secret"),
    )
    plan = recovery_outs[0].plan
    selected = plan.candidates[0]

    assert selected.route == "approval_required"
    assert selected.draft.action_type == "image_pull_secret_fix"

    dispatch_outs = run_handler(
        dispatch_worker.on_recovery_action_selected,
        RecoveryActionSelectedBody(
            plan=plan,
            selected=selected,
            selected_by="operator-1",
            auto_selected=False,
            reason="operator review required",
            workspace_id="workspace-1",
        ),
    )

    assert subjects_of(dispatch_outs) == ["rca.action_required"]
    action_required = dispatch_outs[0]
    assert action_required.reason_code == "security_boundary"
    assert "보안 경계 확인" in action_required.reason
    assert action_required.next_actions[0]["action_type"] == "verify_image_pull_secret"
    assert action_required.diagnostics["action_type"] == "image_pull_secret_fix"
    assert action_required.diagnostics["route"] == "approval_required"
    assert action_required.diagnostics["approval_reason"] == "security_boundary"


def test_recovery_command_targets_owner_deployment_from_pod_or_replicaset() -> None:
    assert command_target_name("Pod", "checkout-api-7d9f8c9b7c-abcde", {}) == "checkout-api"
    assert command_target_name("ReplicaSet", "checkout-api-7d9f8c9b7c", {}) == "checkout-api"
    assert command_target_name("Deployment", "checkout-api", {}) == "checkout-api"
    assert (
        command_target_name(
            "Pod",
            "checkout-api-7d9f8c9b7c-abcde",
            {"deployment_name": "orders-api"},
        )
        == "orders-api"
    )
    assert (
        command_diff_resource(
            Command.DEFAULT_ACTION,
            "checkout-api",
            "Pod",
            "checkout-api-7d9f8c9b7c-abcde",
        )
        == "deployment/checkout-api"
    )
    assert (
        command_diff_resource("apply_manifest", "checkout-api", "Pod", "checkout-api-pod")
        == "Pod/checkout-api-pod"
    )


def test_recovery_command_targets_owner_deployment_for_pod_and_replicaset() -> None:
    recovery_worker = load_service("ai/recovery-worker")
    dispatch_worker = load_service("ai/dispatch-worker")

    cases = [
        ("Pod", "orders-api-96876968-rlqwg", "orders-api"),
        ("ReplicaSet", "storefront-web-7b94fc878c", "storefront-web"),
        ("Deployment", "orders-api", "orders-api"),
    ]
    for resource_kind, resource_name, deployment in cases:
        recovery_outs = run_handler(
            recovery_worker.on_rca_completed,
            report_for(
                "backend_readiness_failure",
                resource_kind=resource_kind,
                resource_name=resource_name,
            ),
        )
        plan = recovery_outs[0].plan

        restart_command = run_handler(
            dispatch_worker.on_recovery_action_selected,
            RecoveryActionSelectedBody(
                plan=plan,
                selected=plan.candidates[0],
                selected_by="agent-select",
                auto_selected=True,
                reason="auto selected restart",
                workspace_id="workspace-1",
            ),
        )[0]
        assert restart_command.diff.resource == f"deployment/{deployment}"

        scale_command = run_handler(
            dispatch_worker.on_recovery_action_selected,
            RecoveryActionSelectedBody(
                plan=plan,
                selected=plan.candidates[1],
                selected_by="operator-1",
                auto_selected=False,
                reason="operator selected scale",
                workspace_id="workspace-1",
            ),
        )[0]
        assert scale_command.diff.resource == f"deployment/{deployment}"
        assert scale_command.payload["name"] == deployment


def test_evidence_lineage_is_attached_without_mutating_source_payload(monkeypatch) -> None:
    monkeypatch.setenv("EVIDENCE_COLLECTOR_VERSION", "agent-sha-1")
    payload = crashloop_payload(source_id="cluster-snapshot", window_start="window-1")

    evidence = EvidenceBuilder().build_evidence(payload, "corr-lineage")

    assert EVIDENCE_LINEAGE_KEY not in payload.kubernetes
    assert EVIDENCE_LINEAGE_KEY not in payload.metrics
    assert EVIDENCE_LINEAGE_KEY not in payload.logs[0]
    assert evidence.kubernetes[EVIDENCE_LINEAGE_KEY] == {
        "schema_version": 1,
        "source": "kubernetes",
        "collector": "cluster-agent",
        "collector_version": "agent-sha-1",
        "workspace_id": "workspace-1",
        "cluster_id": "target-cluster-01",
        "source_id": "cluster-snapshot",
        "window_start": "window-1",
    }
    assert evidence.metrics[EVIDENCE_LINEAGE_KEY]["source"] == "metrics"
    assert evidence.logs[0][EVIDENCE_LINEAGE_KEY]["source"] == "logs"
    assert evidence.traces[EVIDENCE_LINEAGE_KEY]["source"] == "traces"


def test_evidence_bundle_promotes_lineage_to_rca_items(monkeypatch) -> None:
    monkeypatch.setenv("EVIDENCE_COLLECTOR_VERSION", "agent-sha-2")
    db = SpyDb()
    payload = crashloop_payload(source_id="cluster-snapshot", window_start="window-2")

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-lineage-items")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    by_source = {item.source: item for item in bundle.items}
    kubernetes_lineage = by_source["kubernetes"].value[EVIDENCE_LINEAGE_KEY]
    assert kubernetes_lineage["schema_version"] == 1
    assert kubernetes_lineage["collector_version"] == "agent-sha-2"
    assert kubernetes_lineage["check_id"] == "evidence:kubernetes:cluster_resource_state"
    assert kubernetes_lineage["query"] == "kubernetes.cluster_resource_state"
    assert kubernetes_lineage["window_start"] == "window-2"


def test_evidence_bundle_preserves_provider_schema_v1_item_keys() -> None:
    db = SpyDb()
    payload = crashloop_payload(
        traces={
            "source": "tempo",
            "results": {
                "application_error_spans": {
                    "query": "{ status = error }",
                    "traces": [],
                    "analysis": {"error_count": 0},
                    "trace_count": 0,
                }
            },
        },
        metadata={"change_context": {"current_workload_snapshots": []}},
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-schema-v1")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    item_keys = {f"{item.source}:{item.name}" for item in bundle.items}
    assert {
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
        "traces:related_traces",
    } <= item_keys
    assert "metadata:current_workload_snapshots" not in item_keys
    trace_item = next(item for item in bundle.items if item.source == "traces")
    assert trace_item.value["results"]["application_error_spans"]["trace_count"] == 0


def loki_log_entry(
    namespace: str,
    line: str,
    *,
    query_name: str = "namespace_errors",
    pod_name: str | None = None,
) -> dict:
    """Loki provider(normalize_payload) 출력과 같은 모양의 로그 evidence 항목."""
    stream_labels = {"k8s_namespace_name": namespace, "k8s_container_name": "app"}
    if pod_name:
        stream_labels["k8s_pod_name"] = pod_name
    return {
        "source": "loki",
        "query_name": query_name,
        "query": f'{{k8s_namespace_name="{namespace}"}} |= "ERROR"',
        "result_type": "streams",
        "streams": [
            {
                "stream": stream_labels,
                "values": [{"timestamp": "1751871600000000000", "line": line}],
            }
        ],
        "line_count": 1,
    }


def test_incident_events_use_compact_evidence_reference_and_bounded_bundle() -> None:
    """이벤트 버스에는 원본 evidence 전체가 아니라 RCA에 필요한 축약 근거만 싣는다."""
    db = SpyDb()
    long_line = "OOMKilled " + ("x" * (MAX_TEXT_LENGTH + 200))
    payload = crashloop_payload(
        source_id="cluster-snapshot",
        window_start="window-large",
        metrics={
            "source": "prometheus",
            "results": {f"query-{idx}": {"values": list(range(30))} for idx in range(30)},
        },
        logs=[
            loki_log_entry("sandbox", long_line, query_name=f"namespace_errors_{idx}")
            for idx in range(MAX_LOG_ENTRIES + 5)
        ],
        traces={
            "source": "tempo",
            "results": {
                f"trace-{idx}": {"spans": [{"name": "span", "detail": long_line}]}
                for idx in range(20)
            },
        },
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-compact-bundle")

    detected = event_by_subject(rca_events, "incident.detected")
    assert detected.evidence.object_ref == "object://evidence/corr-compact-bundle.json"
    assert detected.evidence.logs == []
    assert "pods" not in detected.evidence.kubernetes

    bundle_event = event_by_subject(rca_events, "evidence.bundle.built")
    assert bundle_event.evidence.logs == []
    logs_item = next(item for item in bundle_event.evidence_bundle.items if item.source == "logs")
    assert len(logs_item.value["entries"]) == MAX_LOG_ENTRIES
    sample = logs_item.value["entries"][0]["streams"][0]["values"][0]["line"]
    assert len(sample) == MAX_TEXT_LENGTH + 3


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


def test_rca_test_bundle_excludes_prior_run_logs_from_same_namespace() -> None:
    """동일 namespace의 이전 test Pod 로그가 현재 run의 원인 판정을 오염시키지 않는다."""
    current_pod = "rca-test-crash-app-startup-7f8d9c6b5-x2k4m"
    payload = crashloop_payload(
        logs=[
            loki_log_entry(
                "sandbox",
                "FATAL: required environment variable DATABASE_URL is not set",
                pod_name="rca-test-crash-config-env-6d7c8b5f4-p9q2r",
            ),
            loki_log_entry(
                "sandbox",
                "FATAL: startup failed",
                pod_name=current_pod,
            ),
        ],
        metadata={
            "rca_test": {
                "run_id": "run-app-startup",
                "scenario_id": "crash.app-startup",
                "pod_names": [current_pod],
            }
        },
    )

    rca_events = run_to_rca(payload, db=SpyDb(), correlation_id="corr-test-pod-filter")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    logs_item = next(item for item in bundle.items if item.source == "logs")
    selected_lines = [
        value["line"]
        for entry in logs_item.value["entries"]
        for stream in entry["streams"]
        for value in stream["values"]
    ]
    assert selected_lines == ["FATAL: startup failed"]
    completed = event_by_subject(rca_events, "rca.completed")
    assert completed.root_cause == "app_startup_failure"


def test_rca_test_bundle_filters_matched_entries_to_current_pod() -> None:
    current_pod = "rca-test-crash-app-startup-7f8d9c6b5-x2k4m"
    prior_pod = "rca-test-crash-config-env-6d7c8b5f4-p9q2r"
    payload = crashloop_payload(
        logs=[
            {
                "source": "loki",
                "query_name": "rca_test_logs",
                "query": '{k8s_namespace_name="sandbox"} |= "FATAL"',
                "result_type": "streams",
                "streams": [
                    {
                        "stream": {
                            "k8s_namespace_name": "sandbox",
                            "k8s_pod_name": prior_pod,
                            "k8s_container_name": "app",
                        },
                        "values": [
                            {
                                "timestamp": "1751871600000000000",
                                "line": (
                                    "FATAL: required environment variable DATABASE_URL is not set"
                                ),
                            }
                        ],
                        "line_count": 1,
                        "pattern_counts": {
                            "missing_env": 1,
                            "permission_denied_startup": 0,
                        },
                        "severity_counts": {"critical": 1},
                        "trace_ids": ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
                    },
                    {
                        "stream": {
                            "k8s_namespace_name": "sandbox",
                            "k8s_pod_name": current_pod,
                            "k8s_container_name": "app",
                        },
                        "values": [
                            {
                                "timestamp": "1751871601000000000",
                                "line": "FATAL: permission denied opening /data",
                            }
                        ],
                        "line_count": 1,
                        "pattern_counts": {
                            "missing_env": 0,
                            "permission_denied_startup": 1,
                        },
                        "severity_counts": {"critical": 1},
                        "trace_ids": ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
                    },
                ],
                "line_count": 2,
                "pattern_counts": {
                    "missing_env": 1,
                    "permission_denied_startup": 1,
                },
                "severity_counts": {"critical": 2},
                "trace_ids": [
                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                ],
                "collection_limit": {
                    "matched_entries": {
                        "max_items": 20,
                        "original_count": 2,
                        "returned_count": 2,
                        "truncated": False,
                    }
                },
                "redaction_summary": {
                    "applied": True,
                    "redacted_line_count": 0,
                    "truncated_line_count": 0,
                },
                "matched_entries": [
                    {
                        "timestamp": "1751871600000000000",
                        "namespace": "sandbox",
                        "pod": prior_pod,
                        "container": "app",
                        "severity": "critical",
                        "message": ("FATAL: required environment variable DATABASE_URL is not set"),
                        "matched_patterns": ["missing_env"],
                        "line_truncated": False,
                    },
                    {
                        "timestamp": "1751871601000000000",
                        "namespace": "sandbox",
                        "pod": current_pod,
                        "container": "app",
                        "severity": "critical",
                        "message": "FATAL: permission denied opening /data",
                        "matched_patterns": ["permission_denied_startup"],
                        "line_truncated": False,
                    },
                ],
            }
        ],
        metadata={
            "rca_test": {
                "run_id": "run-app-startup",
                "scenario_id": "crash.app-startup",
                "pod_names": [current_pod],
            }
        },
    )

    rca_events = run_to_rca(payload, db=SpyDb(), correlation_id="corr-test-matched-entries")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    logs_item = next(item for item in bundle.items if item.source == "logs")
    entries = logs_item.value["entries"]
    assert entries[0]["line_count"] == 1
    assert [stream["stream"]["k8s_pod_name"] for stream in entries[0]["streams"]] == [current_pod]
    assert entries[0]["matched_entries"] == [
        {
            "timestamp": "1751871601000000000",
            "namespace": "sandbox",
            "pod": current_pod,
            "container": "app",
            "severity": "critical",
            "message": "FATAL: permission denied opening /data",
            "matched_patterns": ["permission_denied_startup"],
            "line_truncated": False,
        }
    ]
    assert entries[0]["pattern_counts"] == {
        "missing_env": 0,
        "permission_denied_startup": 1,
    }
    assert entries[0]["severity_counts"] == {"critical": 1}
    assert entries[0]["trace_ids"] == ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]
    assert entries[0]["collection_limit"] == {
        "matched_entries": {
            "max_items": 20,
            "original_count": 2,
            "returned_count": 2,
            "truncated": False,
        }
    }
    assert entries[0]["redaction_summary"] == {
        "applied": True,
        "redacted_line_count": 0,
        "truncated_line_count": 0,
    }


def test_rca_test_bundle_rejects_log_stream_without_pod_identity() -> None:
    """RCA test 로그에 Pod 라벨이 없으면 다른 run 혼입 위험 때문에 근거로 사용하지 않는다."""
    payload = crashloop_payload(
        logs=[loki_log_entry("sandbox", "FATAL: startup failed")],
        traces={},
        metadata={
            "rca_test": {
                "run_id": "run-app-startup",
                "scenario_id": "crash.app-startup",
                "pod_names": ["rca-test-crash-app-startup-7f8d9c6b5-x2k4m"],
            }
        },
    )

    rca_events = run_to_rca(payload, db=SpyDb(), correlation_id="corr-test-no-pod-label")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    assert all(item.source != "logs" for item in bundle.items)
    assert rca_events[-1].__subject__ == "rca.analysis_blocked"


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


def test_evidence_bundle_adds_change_context_metadata_item() -> None:
    db = SpyDb()
    payload = crashloop_payload(
        metadata={
            "change_context": {
                "recent_changes": [
                    {
                        "change_type": "secret_ref",
                        "changed_at": "2026-07-07T10:13:00Z",
                        "target_resource": "Secret/checkout-api",
                        "field": "DATABASE_URL",
                        "before": "postgres://real-user:real-password@db",
                        "after": "postgres://new-user:new-password@db",
                        "source": "gitops",
                    }
                ],
                "gitops": {
                    "repository_id": "repo-1",
                    "branch": "main",
                    "manifest_path": "deploy/checkout-api.yaml",
                    "commit_sha": "abc1234",
                },
                "rollout": {"revision": "42", "rollback_available": True},
            }
        },
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-change-context")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    metadata_item = next(item for item in bundle.items if item.source == "metadata")
    assert metadata_item.name == "change_context"
    assert metadata_item.value["resource"] == {
        "namespace": "sandbox",
        "workload_kind": "deployment",
        "workload_name": "checkout-api",
    }
    assert metadata_item.value["gitops"]["commit_sha"] == "abc1234"
    assert metadata_item.value["rollout"]["rollback_available"] is True
    change = metadata_item.value["recent_changes"][0]
    assert change["before"] == "redacted"
    assert change["after"] == "redacted"
    assert "real-password" not in str(metadata_item.value)


def test_evidence_bundle_adds_workload_snapshot_metadata_items() -> None:
    db = SpyDb()
    payload = crashloop_payload(
        metadata={
            "current_workload_snapshots": [
                {
                    "namespace": "sandbox",
                    "kind": "Deployment",
                    "name": "checkout-api",
                    "image": "repo/checkout:v2",
                    "ready_replicas": 0,
                }
            ],
            "current_workload_snapshot": {
                "namespace": "sandbox",
                "kind": "Deployment",
                "name": "checkout-api",
                "image": "repo/checkout:v2",
                "conditions": [{"type": "Progressing", "reason": "ProgressDeadlineExceeded"}],
            },
        },
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-workload-snapshot")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    metadata_items = {item.name: item for item in bundle.items if item.source == "metadata"}
    snapshots = metadata_items["current_workload_snapshots"]
    snapshot = metadata_items["current_workload_snapshot"]
    assert snapshots.value["items"][0]["name"] == "checkout-api"
    assert snapshots.value["items"][0]["ready_replicas"] == 0
    assert snapshot.value["conditions"][0]["reason"] == "ProgressDeadlineExceeded"
    assert "change_context" not in metadata_items


def test_evidence_bundle_adds_nested_workload_snapshot_metadata_items() -> None:
    db = SpyDb()
    payload = crashloop_payload(
        metadata={
            "change_context": {
                "current_workload_snapshots": [
                    {
                        "namespace": "sandbox",
                        "kind": "Deployment",
                        "name": "checkout-api",
                        "image": "repo/checkout:v2",
                        "ready_replicas": 0,
                    }
                ],
                "current_workload_snapshot": {
                    "namespace": "sandbox",
                    "kind": "Deployment",
                    "name": "checkout-api",
                    "image": "repo/checkout:v2",
                    "conditions": [{"type": "Progressing", "reason": "ProgressDeadlineExceeded"}],
                },
            },
        },
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-nested-workload-snapshot")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    metadata_items = {item.name: item for item in bundle.items if item.source == "metadata"}
    snapshots = metadata_items["current_workload_snapshots"]
    snapshot = metadata_items["current_workload_snapshot"]
    assert snapshots.value["items"][0]["name"] == "checkout-api"
    assert snapshot.value["conditions"][0]["reason"] == "ProgressDeadlineExceeded"
    assert "change_context" not in metadata_items


def test_evidence_bundle_adds_service_and_endpoint_metadata_items() -> None:
    db = SpyDb()
    payload = crashloop_payload(
        metadata={
            "change_context": {
                "service_selector_matches": [
                    {
                        "service": {"namespace": "sandbox", "name": "checkout-api"},
                        "selector": {"app": "checkout-api"},
                        "match_status": "matched",
                        "matched_pod_count": 1,
                        "matched_pods": [{"namespace": "sandbox", "name": "checkout-api-pod"}],
                    }
                ],
                "endpoint_slice_ready_endpoints": [
                    {
                        "service": {"namespace": "sandbox", "name": "checkout-api"},
                        "endpoint_slice": {"namespace": "sandbox", "name": "checkout-api-abc"},
                        "endpoint_count": 1,
                        "ready_endpoint_count": 0,
                        "not_ready_endpoint_count": 1,
                    }
                ],
            },
        },
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-service-endpoint-metadata")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    metadata_items = {item.name: item for item in bundle.items if item.source == "metadata"}
    service_matches = metadata_items["service_selector_matches"]
    endpoint_slices = metadata_items["endpoint_slice_ready_endpoints"]
    assert service_matches.value["items"][0]["service"]["name"] == "checkout-api"
    assert service_matches.value["items"][0]["matched_pod_count"] == 1
    assert endpoint_slices.value["items"][0]["endpoint_slice"]["name"] == "checkout-api-abc"
    assert endpoint_slices.value["items"][0]["ready_endpoint_count"] == 0
    assert "change_context" not in metadata_items


def test_evidence_bundle_attaches_metadata_collection_limits() -> None:
    db = SpyDb()
    payload = crashloop_payload(
        metadata={
            "change_context": {
                "current_workload_snapshots": [
                    {
                        "namespace": "sandbox",
                        "kind": "Deployment",
                        "name": "checkout-api",
                    }
                ],
                "service_selector_matches": [
                    {
                        "service": {"namespace": "sandbox", "name": "checkout-api"},
                        "match_status": "matched",
                        "matched_pod_count": 25,
                    }
                ],
                "endpoint_slice_ready_endpoints": [
                    {
                        "endpoint_slice": {
                            "namespace": "sandbox",
                            "name": "checkout-api-abc",
                        },
                        "ready_endpoint_count": 1,
                    }
                ],
                "referenced_config_objects": [
                    {
                        "kind": "ConfigMap",
                        "namespace": "sandbox",
                        "name": "checkout-config",
                        "found": False,
                        "referenced_by": [
                            {
                                "kind": "Deployment",
                                "namespace": "sandbox",
                                "name": "checkout-api",
                            }
                        ],
                    }
                ],
                "resource_quotas": [
                    {
                        "namespace": "sandbox",
                        "name": "sandbox-quota",
                        "hard": {"limits.cpu": "2"},
                        "used": {"limits.cpu": "2"},
                    }
                ],
                "collection_limits": {
                    "truncated": True,
                    "lists": {
                        "current_workload_snapshots": {
                            "truncated": True,
                            "original_count": 1000,
                            "returned_count": 200,
                        },
                        "service_selector_matches": {
                            "truncated": True,
                            "original_count": 300,
                            "returned_count": 200,
                        },
                        "endpoint_slice_ready_endpoints": {
                            "truncated": True,
                            "original_count": 250,
                            "returned_count": 200,
                        },
                        "referenced_config_objects": {
                            "truncated": False,
                            "original_count": 1,
                            "returned_count": 1,
                        },
                        "resource_quotas": {
                            "truncated": False,
                            "original_count": 1,
                            "returned_count": 1,
                        },
                    },
                },
            },
        },
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-metadata-limits")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    metadata_items = {item.name: item for item in bundle.items if item.source == "metadata"}
    assert metadata_items["current_workload_snapshots"].value["collection_limit"] == {
        "truncated": True,
        "original_count": 1000,
        "returned_count": 200,
    }
    assert metadata_items["service_selector_matches"].value["collection_limit"] == {
        "truncated": True,
        "original_count": 300,
        "returned_count": 200,
    }
    assert metadata_items["endpoint_slice_ready_endpoints"].value["collection_limit"] == {
        "truncated": True,
        "original_count": 250,
        "returned_count": 200,
    }
    assert metadata_items["referenced_config_objects"].value["items"][0]["name"] == (
        "checkout-config"
    )
    assert metadata_items["referenced_config_objects"].value["collection_limit"] == {
        "truncated": False,
        "original_count": 1,
        "returned_count": 1,
    }
    assert metadata_items["resource_quotas"].value["items"][0]["name"] == "sandbox-quota"
    assert metadata_items["resource_quotas"].value["collection_limit"] == {
        "truncated": False,
        "original_count": 1,
        "returned_count": 1,
    }
    assert "change_context" not in metadata_items


def test_evidence_bundle_skips_empty_change_context_metadata_item() -> None:
    db = SpyDb()
    payload = crashloop_payload(
        metadata={
            "change_context": {
                "recent_changes": [],
                "rollback_available": None,
                "risk_level": "unknown",
            }
        },
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-empty-change-context")

    bundle = event_by_subject(rca_events, "evidence.bundle.built").evidence_bundle
    assert all(
        not (item.source == "metadata" and item.name == "change_context") for item in bundle.items
    )


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


def test_rca_test_report_bypasses_incident_dedup_and_saves_correlation() -> None:
    run_pod = "rca-test-crash-app-startup-7f8d9c6b5-x2k4m"
    db = SpyDb(
        find_recent_rca_report={
            "id": 1,
            "correlation_id": "corr-earlier",
            "created_at": "2026-07-07T09:00:00+00:00",
        }
    )
    payload = crashloop_payload(
        logs=[loki_log_entry("sandbox", "FATAL: startup failed", pod_name=run_pod)],
        metadata={
            "rca_test": {
                "run_id": "run-1",
                "scenario_id": "crash.app-startup",
                "pod_names": [run_pod],
            }
        },
    )

    rca_events = run_to_rca(payload, db=db, correlation_id="corr-rca-test")

    assert rca_events[-1].__subject__ == "rca.completed"
    assert not db.called("find_recent_rca_report")
    save = next(call for call in db.calls if call[0] == "save_rca_report")
    assert save[1][0] == "corr-rca-test"


def test_no_incident_flow_stops_before_rca_analysis() -> None:
    db = SpyDb()

    events = run_to_rca(empty_payload(), db=db, correlation_id="corr-empty")

    assert subjects_of(events) == [
        "evidence.built",
        "incident.detected",
    ]
    assert event_by_subject(events, "incident.detected").detected is False
    assert event_by_subject(events, "incident.detected").incident is None
    assert event_by_subject(events, "incident.detected").affected == []
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


def test_blocked_rca_with_root_cause_still_offers_recovery_selection() -> None:
    feedback_worker = load_service("ai/rca-feedback-worker")
    select_worker = load_service("ai/select-worker")
    incident = IncidentRecord(
        incident_id="inc-upstream",
        cluster_id="cluster-1",
        resource_kind="Deployment",
        resource_name="orders-api",
        namespace="sandbox",
        symptom="사용자 요청 5xx 오류",
        severity="high",
        first_seen_at=None,
        summary="orders-api 5xx spike",
        workspace_id="workspace-1",
    )
    detail = RcaReportDetail(
        root_cause="upstream_unavailable",
        confidence=0.62,
        selected_candidate_id="upstream_unavailable",
        supporting_evidence=["kubernetes", "metrics", "logs"],
        missing_evidence=["signal:upstream_failure_signal"],
        reason="upstream failure candidate is most likely, but one signal is still missing",
    )
    blocked = RcaAnalysisBlockedBody(
        reason_code="evidence_missing",
        reason="missing signal:upstream_failure_signal",
        evidence_ref="object://evidence/corr-upstream.json",
        rca_detail=detail,
        workspace_id="workspace-1",
        evidence=Evidence(
            cluster_id="cluster-1",
            kubernetes={},
            metrics={},
            logs=[],
            traces={},
            object_ref="object://evidence/corr-upstream.json",
            workspace_id="workspace-1",
        ),
        incident=incident,
        evidence_bundle=EvidenceBundle(
            incident_id=incident.incident_id,
            items=[],
            missing_evidence=["signal:upstream_failure_signal"],
            complete=False,
        ),
        missing_evidence=["signal:upstream_failure_signal"],
    )

    feedback_outs = run_handler(feedback_worker.on_rca_analysis_blocked, blocked)

    assert subjects_of(feedback_outs) == ["rca.followup.required", "recovery.planned"]
    plan = feedback_outs[1].plan
    assert plan.selection_required is True
    assert [candidate.draft.action_type for candidate in plan.candidates[:2]] == [
        "rollout_restart",
        "deployment_scale",
    ]
    assert all(candidate.approval_required for candidate in plan.candidates)
    assert plan.candidates[0].draft.params["analysis_blocked_fallback"] is True

    select_outs = run_handler(select_worker.on_recovery_planned, feedback_outs[1])
    assert subjects_of(select_outs) == ["recovery.selection_requested"]


def test_plan_worker_resolves_backlog_when_rule_exists() -> None:
    db = SpyDb()
    evidence_worker = load_service("ai/evidence-worker")
    incident_worker = load_service("ai/incident-worker")
    plan_worker = load_service("ai/plan-worker")

    evidence_outs = run_handler(
        evidence_worker.on_cluster_evidence,
        crashloop_payload(),
        db=db,
        correlation_id="corr-backlog-resolved",
    )
    incident_outs = run_handler(
        incident_worker.on_evidence_built,
        evidence_outs[0],
        db=db,
        correlation_id="corr-backlog-resolved",
    )
    plan_outs = run_handler(
        plan_worker.on_evidence_bundle_built,
        incident_outs[-1],
        db=db,
        correlation_id="corr-backlog-resolved",
    )

    assert subjects_of(plan_outs) == ["rca.candidates.planned"]
    assert db.called("resolve_rca_backlog_item_for_rule")
    resolve_call = next(call for call in db.calls if call[0] == "resolve_rca_backlog_item_for_rule")
    assert resolve_call[1] == (
        "workspace-1",
        "CrashLoopBackOff",
        "matching RCA rule is now available",
    )


def test_cause_evaluator_matches_source_and_named_evidence_keys() -> None:
    from services.ai.agent.causes.engine import evaluate_causes

    candidate = CauseCandidate(
        candidate_id="probe_path_wrong",
        title="Probe path mismatch",
        description="Probe 설정과 실제 응답 경로가 맞지 않는 후보입니다.",
        expected_evidence=[
            "kubernetes:cluster_resource_state",
            "logs",
            "metadata:change_context",
        ],
        checks=["probe path와 event message를 비교"],
    )
    bundle = EvidenceBundle(
        incident_id="inc-probe",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={"pods": [{"waiting_reasons": ["CrashLoopBackOff"]}]},
                summary="Kubernetes state",
            ),
            EvidenceItem(
                source="logs",
                name="related_logs",
                value={"entries": [{"line": "readiness probe returned 404"}]},
                summary="Application logs",
            ),
        ],
        missing_evidence=[],
        complete=True,
    )

    evaluation = evaluate_causes([candidate], bundle)[0]

    assert evaluation.supporting_evidence == [
        "kubernetes:cluster_resource_state",
        "logs",
    ]
    assert evaluation.missing_evidence == ["metadata:change_context"]
    assert evaluation.score == 2 / 3
    assert [(ref.source, ref.name) for ref in evaluation.supporting_evidence_refs] == [
        ("kubernetes", "cluster_resource_state"),
        ("logs", "related_logs"),
    ]


def test_user_selected_safe_pr_flow_requires_authority_instead_of_document_fallback(
    monkeypatch,
) -> None:
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
    approval_summary = approval_outs[0].details["approval_summary"]
    assert approval_summary["kind"] == "recovery_selection"
    assert approval_summary["plan_id"] == plan.plan_id
    assert approval_summary["recommended_action_id"] == plan.recommended_action_id
    assert approval_summary["execution_channel"] == "safe_pr"
    assert approval_summary["candidate_count"] == len(plan.candidates)
    assert approval_summary["auto_execution_allowed"] is False
    assert approval_summary["recommended_candidate"]["route"] == selected.route
    assert approval_summary["recommended_candidate"]["execution_channel"] == "safe_pr"
    assert approval_summary["recommended_candidate"]["auto_execution_allowed"] is False
    assert approval_outs[0].details["candidates"][0]["action_id"] == selected.action_id

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
    assert dispatch_outs[0].reason_code == "gitops_authority_unavailable"
    assert dispatch_outs[0].missing_evidence == ["gitops_authority_context"]
    assert not db.called("save_pull_request")


def test_application_5xx_recovery_uses_review_patch_without_static_manifest(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    monkeypatch.setenv("SCM_REPO", "project/repo")
    recovery_worker = load_service("ai/recovery-worker")
    select_worker = load_service("ai/select-worker")
    dispatch_worker = load_service("ai/dispatch-worker")

    recovery_outs = run_handler(
        recovery_worker.on_rca_completed,
        report_for(
            "application_5xx_spike",
            resource_kind="Deployment",
            resource_name="orders-api",
        ),
    )
    plan = recovery_outs[0].plan

    assert plan.selection_required is True
    review_candidate = next(
        candidate
        for candidate in plan.candidates
        if candidate.draft.action_type == "gitops_recovery_review"
    )
    assert review_candidate.route == "draft_pr"
    assert review_candidate.score < plan.candidates[0].score

    select_outs = run_handler(select_worker.on_recovery_planned, recovery_outs[0])
    assert subjects_of(select_outs) == ["recovery.selection_requested"]

    dispatch_outs = run_handler(
        dispatch_worker.on_recovery_action_selected,
        RecoveryActionSelectedBody(
            plan=plan,
            selected=review_candidate,
            selected_by="operator",
            auto_selected=False,
            reason="operator approved demo recovery",
            workspace_id="workspace-1",
        ),
    )

    assert subjects_of(dispatch_outs) == ["safe_pr.requested"]
    patches = {patch.path: patch.content for patch in dispatch_outs[0].patches}
    assert len(patches) == 1
    path, content = next(iter(patches.items()))
    assert path.startswith(".gitops/recovery/")
    assert "GitOps 복구 검토 PR" in content
    assert "Deployment/orders-api" in content
    assert "DEMO_MODE: normal" not in content
    assert "final-demo-target" not in content


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
    assert approval_outs[0].details["approval_summary"] == {
        "kind": "rollout_diagnosis",
        "recommendation": "manual_review",
        "diagnosis": "kubernetes api not configured; dry-run only",
        "command_id": "cmd-1",
        "status": "completed",
        "resource": None,
    }
