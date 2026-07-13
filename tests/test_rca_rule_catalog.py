"""RCA 룰 카탈로그(YAML) 테스트 — 고정값 사용 룰 세트와의 동작 동등성 + 로더 계약."""

from __future__ import annotations

import asyncio
from pathlib import Path
from textwrap import dedent
from types import SimpleNamespace

import pytest

from domains.rca.events import (
    CAUSE_CANDIDATE_SOURCE_RULE,
    EvidenceBundle,
    EvidenceItem,
    IncidentRecord,
)
from domains.rca.router import list_rca_rule_catalog, validate_rca_rule_catalog
from packages.contracts.gateway.requests import RcaRuleValidateRequest
from services.ai.agent.causes.engine import evaluate_causes, plan_causes, required_evidence_sources
from services.ai.agent.causes.loader import (
    CauseCatalogError,
    load_catalog_profiles,
    register_catalog_profiles,
)
from services.ai.agent.playbooks.cause import (
    CAUSE_PROFILES,
    cause_rules,
    evidence_rules,
    registered_cause_profiles,
)


def incident_for(symptom: str) -> IncidentRecord:
    return IncidentRecord(
        incident_id="inc-catalog",
        cluster_id="target-cluster-01",
        resource_kind="deployment",
        resource_name="checkout-api",
        namespace="sandbox",
        symptom=symptom,
        severity="high",
        first_seen_at=None,
        summary=f"deployment checkout-api has {symptom}",
        workspace_id="workspace-1",
    )


def empty_bundle() -> EvidenceBundle:
    return EvidenceBundle(
        incident_id="inc-catalog",
        items=[],
        missing_evidence=[],
        complete=True,
    )


def plan_for(symptom: str):
    return plan_causes(incident_for(symptom), empty_bundle(), "object://evidence/catalog.json")


# 현재 RCA 룰 카탈로그의 plan_causes 계약 스냅샷 —
# 증상 → (후보 id 순서, required_evidence_sources). 카탈로그가 이 표와 다르면 회귀다.
EXPECTED_RULE_SNAPSHOT: dict[str, tuple[list[str], list[str]]] = {
    "CrashLoopBackOff": (
        [
            "oom_killed",
            "bad_image_rollout",
            "config_env_error",
            "app_port_bind_failed",
            "permission_denied_startup",
            "app_startup_failure",
            "dependency_connection_failure",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "pod_restart_loop": (
        [
            "oom_killed",
            "bad_image_rollout",
            "config_env_error",
            "app_port_bind_failed",
            "permission_denied_startup",
            "app_startup_failure",
            "dependency_connection_failure",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "DB connection failed": (
        [
            "database_connectivity_failure",
            "database_credential_or_config_error",
            "database_connection_pool_exhausted",
        ],
        ["kubernetes", "metrics", "logs", "traces", "metadata"],
    ),
    "ProgressDeadlineExceeded": (
        ["deployment_progress_deadline_exceeded", "replica_unavailable_after_rollout"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "Rollout failed": (
        ["deployment_progress_deadline_exceeded", "replica_unavailable_after_rollout"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "GitOps Sync Failed": (
        ["gitops_sync_failed", "manifest_validation_failed"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "Sync Failed": (
        ["gitops_sync_failed", "manifest_validation_failed"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "ImagePullBackOff": (
        [
            "wrong_image_tag",
            "missing_image_pull_secret",
            "registry_unavailable",
            "registry_rate_limited",
            "image_platform_mismatch",
        ],
        ["kubernetes"],
    ),
    "ErrImagePull": (
        [
            "wrong_image_tag",
            "missing_image_pull_secret",
            "registry_unavailable",
            "registry_rate_limited",
            "image_platform_mismatch",
        ],
        ["kubernetes"],
    ),
    "DNS lookup failed": (
        [
            "service_dns_resolution_failure",
            "service_name_or_namespace_mismatch",
            "coredns_unavailable",
        ],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "Connection timeout": (
        [
            "network_path_timeout",
            "network_policy_denied",
            "endpoint_unavailable_timeout",
        ],
        ["kubernetes", "metrics", "logs", "traces", "metadata"],
    ),
    "Ingress 502/503": (
        ["upstream_unavailable", "backend_readiness_failure", "application_5xx_spike"],
        ["kubernetes", "metrics", "logs"],
    ),
    "FailedScheduling": (
        [
            "insufficient_cpu",
            "insufficient_memory",
            "node_affinity_or_taint_mismatch",
            "node_selector_mismatch",
            "untolerated_taint",
            "pvc_pending",
        ],
        ["kubernetes"],
    ),
    "Pending": (
        [
            "insufficient_cpu",
            "insufficient_memory",
            "node_affinity_or_taint_mismatch",
            "node_selector_mismatch",
            "untolerated_taint",
            "pvc_pending",
        ],
        ["kubernetes"],
    ),
    "Secret not found": (
        ["missing_secret_reference", "secret_key_missing", "external_secret_sync_failed"],
        ["kubernetes", "logs", "metadata"],
    ),
    "Probe failure": (
        [
            "probe_path_wrong",
            "probe_port_wrong",
            "timeout_too_short",
            "startup_window_too_short",
            "app_real_health_failure",
        ],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "ReadinessProbeFailed": (
        [
            "probe_path_wrong",
            "probe_port_wrong",
            "timeout_too_short",
            "startup_window_too_short",
            "app_real_health_failure",
        ],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "Service has no ready endpoints": (
        [
            "selector_label_mismatch",
            "pods_not_ready",
            "rollout_unavailable",
            "wrong_service_port",
            "endpoint_slice_delay",
        ],
        ["kubernetes", "metadata"],
    ),
    "ServiceEndpointsEmpty": (
        [
            "selector_label_mismatch",
            "pods_not_ready",
            "rollout_unavailable",
            "wrong_service_port",
            "endpoint_slice_delay",
        ],
        ["kubernetes", "metadata"],
    ),
    "OOMKilled": (
        [
            "memory_limit_too_low",
            "memory_leak",
            "traffic_spike",
            "node_memory_pressure",
            "bad_release_memory_regression",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "CPU Saturation": (
        ["cpu_limit_or_throttling"],
        ["kubernetes", "metrics", "logs"],
    ),
    "Disk Pressure": (
        ["node_disk_pressure", "ephemeral_storage_exhausted"],
        ["kubernetes", "metrics", "logs"],
    ),
    "Admission webhook denied": (
        ["policy_violation", "invalid_manifest", "image_vulnerability_block"],
        ["kubernetes", "logs", "metadata"],
    ),
    "RBAC denied": (
        ["service_account_permission_denied"],
        ["kubernetes", "logs", "metadata"],
    ),
    "Certificate expired": (
        ["certificate_expired_or_invalid"],
        ["kubernetes", "logs", "traces", "metadata"],
    ),
    "Redis unavailable": (
        ["redis_dependency_unavailable"],
        ["metrics", "logs", "traces"],
    ),
    "Kafka consumer lag": (
        ["consumer_lag_backlog"],
        ["metrics", "logs"],
    ),
    "External API timeout": (
        ["external_api_timeout"],
        ["metrics", "logs", "traces"],
    ),
    "DB/cache/queue dependency failure": (
        [
            "dependency_down",
            "connection_pool_exhausted",
            "wrong_endpoint_config",
            "credential_rotation_issue",
        ],
        ["metrics", "logs", "traces", "metadata"],
    ),
    "HPA scaling failed": (
        [
            "metrics_server_unavailable",
            "missing_resource_requests",
            "max_replica_limit_reached",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "FailedGetResourceMetric": (
        [
            "metrics_server_unavailable",
            "missing_resource_requests",
            "max_replica_limit_reached",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "NodeNotReady": (
        [
            "kubelet_unavailable",
            "container_runtime_unavailable",
            "node_network_unavailable",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "KubeletNotReady": (
        [
            "kubelet_unavailable",
            "container_runtime_unavailable",
            "node_network_unavailable",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "Pod evicted": (
        [
            "pod_evicted_memory_pressure",
            "pod_evicted_disk_pressure",
            "pod_evicted_pid_pressure",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "Evicted": (
        [
            "pod_evicted_memory_pressure",
            "pod_evicted_disk_pressure",
            "pod_evicted_pid_pressure",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "ConfigMap not found": (
        [
            "missing_configmap_reference",
            "config_key_missing",
            "invalid_env_value",
            "config_volume_mount_failed",
        ],
        ["kubernetes", "logs", "metadata"],
    ),
    "CreateContainerConfigError": (
        [
            "missing_configmap_reference",
            "config_key_missing",
            "invalid_env_value",
            "config_volume_mount_failed",
        ],
        ["kubernetes", "logs", "metadata"],
    ),
    "FailedMount": (
        [
            "pvc_not_bound",
            "csi_driver_unavailable",
            "volume_attach_timeout",
            "storage_class_mismatch",
        ],
        ["kubernetes", "logs", "metadata"],
    ),
    "FailedAttachVolume": (
        [
            "volume_multi_attach_conflict",
            "volume_attachment_orphaned",
        ],
        ["kubernetes", "logs", "metadata"],
    ),
}


def test_catalog_rules_match_previous_static_plan_snapshot() -> None:
    """(a) 계약 스냅샷 — YAML 카탈로그가 현재 룰 계획을 유지해야 한다."""
    for symptom, (expected_candidates, expected_sources) in EXPECTED_RULE_SNAPSHOT.items():
        plan = plan_for(symptom)

        assert plan.rule_missing is None, symptom
        assert [c.candidate_id for c in plan.candidates] == expected_candidates, symptom
        assert required_evidence_sources(incident_for(symptom)) == expected_sources, symptom
        assert all(c.source == CAUSE_CANDIDATE_SOURCE_RULE for c in plan.candidates), symptom


def test_rca_rule_validate_route_returns_candidate_summary() -> None:
    yaml_text = dedent(
        """
        rules:
          - id: "custom_dns"
            symptoms: ["DNS lookup failed"]
            required_sources: ["kubernetes", "logs"]
            candidates:
              - candidate_id: "service_dns_resolution_failure"
                title: "서비스 DNS 실패"
                description: "서비스 이름 해석이 실패했습니다."
                expected_evidence: ["kubernetes", "logs"]
                checks:
                  - "CoreDNS 이벤트 확인"
        """
    )

    response = asyncio.run(
        validate_rca_rule_catalog(
            RcaRuleValidateRequest(yaml_text=yaml_text),
            SimpleNamespace(user_id="user-1", workspace_id="workspace-1"),
        )
    )

    assert response.valid is True
    assert response.matched_symptom == "DNS lookup failed"
    assert response.candidates_count == 1


def test_rca_rule_validate_route_reports_schema_errors() -> None:
    response = asyncio.run(
        validate_rca_rule_catalog(
            RcaRuleValidateRequest(yaml_text="rules:\n  - id: broken\n"),
            SimpleNamespace(user_id="user-1", workspace_id="workspace-1"),
        )
    )

    assert response.valid is False
    assert response.errors[0].code == "schema_error"


def test_rca_rule_catalog_route_lists_loaded_rules() -> None:
    response = asyncio.run(
        list_rca_rule_catalog(
            SimpleNamespace(user_id="user-1", workspace_id="workspace-1"),
            registered_cause_profiles(),
        )
    )

    by_id = {item.rule_id: item for item in response.items}

    assert response.rules_count == len(response.items)
    assert response.candidates_count == sum(len(item.candidates) for item in response.items)
    assert by_id["runtime_config_error"].symptoms == [
        "ConfigMap not found",
        "CreateContainerConfigError",
        "Invalid environment config",
    ]
    assert [candidate.candidate_id for candidate in by_id["runtime_config_error"].candidates][
        0
    ] == "missing_configmap_reference"


def test_catalog_oom_killed_candidate_keeps_full_field_parity() -> None:
    """대표 후보(oom_killed)의 전체 필드가 고정값 사용 시절 원문과 동일해야 한다."""
    plan = plan_for("CrashLoopBackOff")
    oom = plan.candidates[0]

    assert oom.candidate_id == "oom_killed"
    assert oom.title == "컨테이너 OOMKilled"
    assert oom.description == "컨테이너가 메모리 제한을 초과해 재시작됐을 가능성이 있습니다."
    assert oom.expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
    ]
    assert oom.checks == [
        "containerStatuses.lastState.terminated.reason == OOMKilled 확인",
        "restartCount 증가와 memory usage가 limit 근처인지 확인",
        "로그에 out of memory, heap, allocation failure 흔적 확인",
    ]


EVIDENCE_ITEM_NAMES = {
    "kubernetes": "cluster_resource_state",
    "metrics": "telemetry_metrics",
    "logs": "related_logs",
    "traces": "related_traces",
    "metadata": "current_workload_snapshots",
}


def evidence_item(source: str, value: dict) -> EvidenceItem:
    return EvidenceItem(
        source=source,
        name=EVIDENCE_ITEM_NAMES.get(source, f"{source}_item"),
        value=value,
        summary=f"{source} 근거",
    )


def crashloop_bundle(*, log_lines: list[str], pods: list[dict]) -> EvidenceBundle:
    return EvidenceBundle(
        incident_id="inc-catalog",
        items=[
            evidence_item("kubernetes", {"pods": pods, "events": []}),
            evidence_item("metrics", {"memory": "near-limit"}),
            evidence_item("logs", {"entries": [{"line": line} for line in log_lines]}),
        ],
        missing_evidence=[],
        complete=True,
    )


def crashloop_pod(**overrides: object) -> dict:
    base: dict = {
        "name": "checkout-api-1",
        "namespace": "sandbox",
        "waiting_reasons": ["CrashLoopBackOff"],
        "terminated_reasons": [],
        "containers": [],
    }
    base.update(overrides)
    return base


def evaluations_by_id(bundle: EvidenceBundle) -> dict:
    plan = plan_for("CrashLoopBackOff")
    return {e.candidate_id: e for e in evaluate_causes(plan.candidates, bundle)}


def evaluations_for(symptom: str, bundle: EvidenceBundle) -> dict:
    plan = plan_for(symptom)
    return {e.candidate_id: e for e in evaluate_causes(plan.candidates, bundle)}


def resource_pressure_bundle(
    *,
    log_lines: list[str],
    events: list[dict] | None = None,
    pods: list[dict] | None = None,
) -> EvidenceBundle:
    return EvidenceBundle(
        incident_id="inc-resource-pressure",
        items=[
            evidence_item("kubernetes", {"pods": pods or [], "events": events or []}),
            evidence_item("metrics", {"results": [{"query": "resource pressure"}]}),
            evidence_item("logs", {"entries": [{"line": line} for line in log_lines]}),
        ],
        missing_evidence=[],
        complete=True,
    )


def test_oom_killed_requires_positive_oom_evidence_for_full_score() -> None:
    """exit 1 크래시(OOM 신호 없음) — oom_killed 는 1.0 불가 + signal 누락 토큰을 남긴다."""
    bundle = crashloop_bundle(
        log_lines=["FATAL: required environment variable DATABASE_URL is not set"],
        pods=[crashloop_pod()],
    )

    by_id = evaluations_by_id(bundle)

    assert by_id["oom_killed"].score < 1.0
    assert "signal:oom_evidence" in by_id["oom_killed"].missing_evidence
    assert by_id["config_env_error"].score == 1.0
    assert by_id["config_env_error"].missing_evidence == []


def test_oom_killed_reaches_full_score_with_terminated_reason() -> None:
    """terminated_reasons=OOMKilled 관측 시 oom_killed 가 1.0 으로 완결 가능하다."""
    bundle = crashloop_bundle(
        log_lines=["container restarted"],
        pods=[crashloop_pod(terminated_reasons=["OOMKilled"])],
    )

    by_id = evaluations_by_id(bundle)

    assert by_id["oom_killed"].score == 1.0
    assert by_id["oom_killed"].missing_evidence == []


def test_oom_killed_reaches_full_score_with_exit_code_137() -> None:
    """직전 컨테이너 종료 코드 137(lastState)도 양성 OOM 근거로 인정된다."""
    bundle = crashloop_bundle(
        log_lines=["container restarted"],
        pods=[
            crashloop_pod(
                containers=[{"name": "app", "last_state": "terminated", "last_exit_code": 137}]
            )
        ],
    )

    by_id = evaluations_by_id(bundle)

    assert by_id["oom_killed"].score == 1.0


def test_non_oom_exit_code_supports_app_startup_failure() -> None:
    """exit 1(non_oom fact) + FATAL 로그는 app_startup_failure 를 1.0 으로 만든다."""
    bundle = crashloop_bundle(
        log_lines=["FATAL: boom during boot"],
        pods=[
            crashloop_pod(
                containers=[{"name": "app", "last_state": "terminated", "last_exit_code": 1}]
            )
        ],
    )

    by_id = evaluations_by_id(bundle)

    assert by_id["app_startup_failure"].score == 1.0
    assert by_id["oom_killed"].score < 1.0


def test_port_bind_failure_reaches_full_score_with_startup_log() -> None:
    """포트 bind 실패 로그가 있으면 일반 startup failure보다 구체 후보가 완결된다."""
    bundle = crashloop_bundle(
        log_lines=["listen tcp :8080: bind: address already in use"],
        pods=[crashloop_pod()],
    )

    by_id = evaluations_by_id(bundle)

    assert by_id["app_port_bind_failed"].score == 1.0
    assert by_id["app_port_bind_failed"].missing_evidence == []
    assert by_id["app_startup_failure"].score < 1.0


def test_permission_denied_startup_reaches_full_score_with_startup_log() -> None:
    """권한 오류 로그가 있으면 permission_denied_startup 후보가 완결된다."""
    bundle = crashloop_bundle(
        log_lines=["permission denied opening /app/config/config.yaml"],
        pods=[crashloop_pod()],
    )

    by_id = evaluations_by_id(bundle)

    assert by_id["permission_denied_startup"].score == 1.0
    assert by_id["permission_denied_startup"].missing_evidence == []
    assert by_id["app_startup_failure"].score < 1.0


def test_no_candidate_gets_full_score_without_distinguishing_evidence() -> None:
    """판별 신호가 전혀 없는 근거(소스만 존재)로는 어떤 crashloop 후보도 1.0 이 될 수 없다."""
    bundle = crashloop_bundle(log_lines=["container restarted"], pods=[crashloop_pod()])

    by_id = evaluations_by_id(bundle)

    assert all(evaluation.score < 1.0 for evaluation in by_id.values())
    assert all(evaluation.missing_evidence for evaluation in by_id.values())


def test_traffic_spike_reaches_full_score_with_request_spike_log() -> None:
    """트래픽 급증/큐 포화 로그가 있으면 traffic_spike 후보가 완결된다."""
    bundle = resource_pressure_bundle(
        log_lines=["request rate spike caused queue full and server overloaded"],
        pods=[crashloop_pod(terminated_reasons=["OOMKilled"])],
    )

    by_id = evaluations_for("OOMKilled", bundle)

    assert by_id["traffic_spike"].score == 1.0
    assert by_id["traffic_spike"].missing_evidence == []


def test_cpu_throttling_reaches_full_score_with_cfs_quota_log() -> None:
    """CPU quota/throttling 로그가 있으면 cpu_limit_or_throttling 후보가 완결된다."""
    bundle = resource_pressure_bundle(
        log_lines=["container was cpu throttled by cfs quota; context deadline exceeded"],
    )

    by_id = evaluations_for("CPU Saturation", bundle)

    assert by_id["cpu_limit_or_throttling"].score == 1.0
    assert by_id["cpu_limit_or_throttling"].missing_evidence == []


def test_image_pull_rate_limit_uses_named_evidence_and_event_signal() -> None:
    bundle = EvidenceBundle(
        incident_id="inc-image",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={
                    "pods": [{"name": "checkout-api-1", "waiting_reasons": ["ImagePullBackOff"]}],
                    "events": [
                        {
                            "reason": "Failed",
                            "message": "Failed to pull image: toomanyrequests: rate limit exceeded",
                        }
                    ],
                },
                summary="Kubernetes image pull event",
            ),
        ],
        missing_evidence=[],
        complete=True,
    )

    by_id = evaluations_for("ImagePullBackOff", bundle)

    assert by_id["registry_rate_limited"].score == 1.0
    assert by_id["registry_rate_limited"].missing_evidence == []


def test_secret_not_found_uses_named_evidence_and_event_signal() -> None:
    bundle = EvidenceBundle(
        incident_id="inc-secret",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={
                    "pods": [{"name": "checkout-api-1", "namespace": "sandbox"}],
                    "events": [
                        {
                            "reason": "FailedMount",
                            "message": (
                                'MountVolume.SetUp failed for volume "api-secret": '
                                'secret "api-secret" not found'
                            ),
                        }
                    ],
                },
                summary="Kubernetes secret event",
            ),
            EvidenceItem(
                source="logs",
                name="related_logs",
                value={"entries": [{"line": "secret not found: api-secret"}]},
                summary="Secret logs",
            ),
                EvidenceItem(
                    source="metadata",
                    name="current_workload_snapshots",
                    value={"items": [{"name": "checkout-api"}]},
                    summary="Workload snapshots",
                ),
                EvidenceItem(
                    source="metadata",
                    name="referenced_config_objects",
                    value={
                        "items": [
                            {
                                "kind": "Secret",
                                "namespace": "sandbox",
                                "name": "api-secret",
                                "found": False,
                            }
                        ]
                    },
                    summary="Secret reference snapshot",
                ),
            ],
            missing_evidence=[],
            complete=True,
        )

    by_id = evaluations_for("Secret not found", bundle)

    assert by_id["missing_secret_reference"].score == 1.0
    assert by_id["missing_secret_reference"].missing_evidence == []


def test_dns_lookup_failed_service_name_mismatch_uses_named_evidence_and_log_signal() -> None:
    bundle = EvidenceBundle(
        incident_id="inc-dns",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={"services": [], "events": []},
                summary="Kubernetes service state",
            ),
            EvidenceItem(
                source="logs",
                name="related_logs",
                value={
                    "entries": [
                        {"line": ("lookup checkout-api.sanbbox.svc.cluster.local: no such host")}
                    ]
                },
                summary="DNS logs",
            ),
            EvidenceItem(
                source="metadata",
                name="service_selector_matches",
                value={"items": [{"service": "checkout-api", "match_status": "not_found"}]},
                summary="Service selector metadata",
            ),
        ],
        missing_evidence=[],
        complete=True,
    )

    by_id = evaluations_for("DNS lookup failed", bundle)

    assert by_id["service_name_or_namespace_mismatch"].score == 1.0
    assert by_id["service_name_or_namespace_mismatch"].missing_evidence == []


def test_connection_timeout_network_policy_uses_named_evidence_and_log_signal() -> None:
    bundle = EvidenceBundle(
        incident_id="inc-timeout",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={"network_policies": [{"name": "deny-egress"}], "events": []},
                summary="Kubernetes network policy state",
            ),
            EvidenceItem(
                source="logs",
                name="related_logs",
                value={"entries": [{"line": "request failed: network policy egress denied"}]},
                summary="Timeout logs",
            ),
            EvidenceItem(
                source="metadata",
                name="network_policy_allows",
                value={"allowed": False, "reason": "egress denied"},
                summary="Network policy metadata",
            ),
        ],
        missing_evidence=[],
        complete=True,
    )

    by_id = evaluations_for("Connection timeout", bundle)

    assert by_id["network_policy_denied"].score == 1.0
    assert by_id["network_policy_denied"].missing_evidence == []


def test_failed_scheduling_taint_uses_named_evidence_and_event_signal() -> None:
    bundle = EvidenceBundle(
        incident_id="inc-scheduling",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={
                    "pods": [{"name": "checkout-api-1", "namespace": "sandbox"}],
                    "events": [
                        {
                            "reason": "FailedScheduling",
                            "message": (
                                "0/3 nodes are available: 3 node(s) had untolerated "
                                "taint {dedicated: gpu}."
                            ),
                        }
                    ],
                },
                summary="Kubernetes scheduling event",
            ),
            EvidenceItem(
                source="metadata",
                name="current_workload_snapshots",
                value={"items": [{"name": "checkout-api", "tolerations": []}]},
                summary="Workload snapshots",
            ),
        ],
        missing_evidence=[],
        complete=True,
    )

    by_id = evaluations_for("FailedScheduling", bundle)

    assert by_id["untolerated_taint"].score == 1.0
    assert by_id["untolerated_taint"].missing_evidence == []


def test_probe_failure_rule_uses_schema_v1_evidence_keys() -> None:
    plan = plan_for("Probe failure")
    by_id = {candidate.candidate_id: candidate for candidate in plan.candidates}

    assert by_id["probe_path_wrong"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metadata:current_workload_snapshots",
    ]
    assert by_id["app_real_health_failure"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
        "traces:related_traces",
    ]


def test_service_endpoint_rule_uses_metadata_endpoint_evidence_keys() -> None:
    plan = plan_for("Service has no ready endpoints")
    by_id = {candidate.candidate_id: candidate for candidate in plan.candidates}

    assert by_id["selector_label_mismatch"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metadata:service_selector_matches",
        "metadata:endpoint_slice_ready_endpoints",
    ]
    assert by_id["wrong_service_port"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metadata:service_selector_matches",
    ]


def test_resource_pressure_rule_uses_schema_v1_evidence_keys() -> None:
    plan = plan_for("OOMKilled")
    by_id = {candidate.candidate_id: candidate for candidate in plan.candidates}
    cpu_plan = plan_for("CPU Saturation")
    cpu_by_id = {candidate.candidate_id: candidate for candidate in cpu_plan.candidates}

    assert by_id["memory_limit_too_low"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
    ]
    assert by_id["bad_release_memory_regression"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
        "metadata:current_workload_snapshots",
    ]
    assert cpu_by_id["cpu_limit_or_throttling"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
    ]


def test_policy_and_dependency_rules_use_schema_v1_evidence_keys() -> None:
    policy_plan = plan_for("Admission webhook denied")
    policy_by_id = {candidate.candidate_id: candidate for candidate in policy_plan.candidates}
    dependency_plan = plan_for("External API timeout")
    dependency_by_id = {
        candidate.candidate_id: candidate for candidate in dependency_plan.candidates
    }

    assert policy_by_id["policy_violation"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metadata:current_workload_snapshots",
    ]
    assert dependency_by_id["external_api_timeout"].expected_evidence == [
        "metrics:telemetry_metrics",
        "logs:related_logs",
        "traces:related_traces",
    ]


def test_network_rules_use_schema_v1_evidence_keys() -> None:
    dns_plan = plan_for("DNS lookup failed")
    dns_by_id = {candidate.candidate_id: candidate for candidate in dns_plan.candidates}
    timeout_plan = plan_for("Connection timeout")
    timeout_by_id = {candidate.candidate_id: candidate for candidate in timeout_plan.candidates}
    ingress_plan = plan_for("Ingress 502/503")
    ingress_by_id = {candidate.candidate_id: candidate for candidate in ingress_plan.candidates}

    assert dns_by_id["service_dns_resolution_failure"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
        "metadata:service_selector_matches",
    ]
    assert timeout_by_id["network_policy_denied"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metadata:network_policy_allows",
    ]
    assert ingress_by_id["upstream_unavailable"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
    ]


def test_rollout_and_db_rules_use_schema_v1_evidence_keys() -> None:
    rollout_plan = plan_for("ProgressDeadlineExceeded")
    rollout_by_id = {candidate.candidate_id: candidate for candidate in rollout_plan.candidates}
    gitops_plan = plan_for("GitOps Sync Failed")
    gitops_by_id = {candidate.candidate_id: candidate for candidate in gitops_plan.candidates}
    db_plan = plan_for("DB connection failed")
    db_by_id = {candidate.candidate_id: candidate for candidate in db_plan.candidates}

    assert rollout_by_id["deployment_progress_deadline_exceeded"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
        "metadata:current_workload_snapshots",
    ]
    assert gitops_by_id["manifest_validation_failed"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metadata:current_workload_snapshots",
    ]
    assert db_by_id["database_connectivity_failure"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
        "traces:related_traces",
        "metadata:current_workload_snapshots",
    ]
    assert db_by_id["database_connection_pool_exhausted"].expected_evidence == [
        "metrics:telemetry_metrics",
        "logs:related_logs",
        "traces:related_traces",
    ]


def test_scheduling_rules_use_schema_v1_evidence_keys() -> None:
    plan = plan_for("FailedScheduling")
    by_id = {candidate.candidate_id: candidate for candidate in plan.candidates}

    assert by_id["insufficient_cpu"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
    ]
    assert by_id["node_selector_mismatch"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metadata:current_workload_snapshots",
    ]
    assert by_id["untolerated_taint"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metadata:current_workload_snapshots",
    ]
    assert by_id["pvc_pending"].expected_evidence == [
        "kubernetes:cluster_resource_state",
    ]


def test_autoscaling_and_node_health_rules_use_schema_v1_evidence_keys() -> None:
    hpa_plan = plan_for("HPA scaling failed")
    hpa_by_id = {candidate.candidate_id: candidate for candidate in hpa_plan.candidates}
    node_plan = plan_for("NodeNotReady")
    node_by_id = {candidate.candidate_id: candidate for candidate in node_plan.candidates}
    eviction_plan = plan_for("Pod evicted")
    eviction_by_id = {candidate.candidate_id: candidate for candidate in eviction_plan.candidates}

    assert hpa_by_id["metrics_server_unavailable"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
    ]
    assert hpa_by_id["missing_resource_requests"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metadata:current_workload_snapshots",
    ]
    assert node_by_id["kubelet_unavailable"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
    ]
    assert eviction_by_id["pod_evicted_disk_pressure"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
    ]


def test_storage_and_runtime_config_rules_use_schema_v1_evidence_keys() -> None:
    mount_plan = plan_for("FailedMount")
    mount_by_id = {candidate.candidate_id: candidate for candidate in mount_plan.candidates}
    attach_plan = plan_for("FailedAttachVolume")
    attach_by_id = {candidate.candidate_id: candidate for candidate in attach_plan.candidates}
    config_plan = plan_for("ConfigMap not found")
    config_by_id = {candidate.candidate_id: candidate for candidate in config_plan.candidates}

    assert mount_by_id["pvc_not_bound"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metadata:current_workload_snapshots",
    ]
    assert mount_by_id["csi_driver_unavailable"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metrics:telemetry_metrics",
    ]
    assert attach_by_id["volume_multi_attach_conflict"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metadata:current_workload_snapshots",
    ]
    assert config_by_id["missing_configmap_reference"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metadata:current_workload_snapshots",
        "metadata:referenced_config_objects",
    ]
    assert config_by_id["invalid_env_value"].expected_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metadata:current_workload_snapshots",
        "metadata:referenced_config_objects",
    ]


def test_probe_path_wrong_evaluates_with_named_evidence_and_event_signal() -> None:
    plan = plan_for("Probe failure")
    bundle = EvidenceBundle(
        incident_id="inc-probe",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={
                    "pods": [],
                    "events": [
                        {
                            "reason": "Unhealthy",
                            "message": "Readiness probe failed: HTTP probe failed with statuscode: 404",
                        }
                    ],
                },
                summary="Kubernetes probe event",
            ),
            EvidenceItem(
                source="logs",
                name="related_logs",
                value={"entries": [{"line": "GET /healthz returned 404 not found"}]},
                summary="Probe logs",
            ),
            EvidenceItem(
                source="metadata",
                name="current_workload_snapshots",
                value={"items": [{"name": "checkout-api"}]},
                summary="Workload snapshots",
            ),
        ],
        missing_evidence=[],
        complete=True,
    )

    by_id = {e.candidate_id: e for e in evaluate_causes(plan.candidates, bundle)}

    assert by_id["probe_path_wrong"].score == 1.0
    assert by_id["probe_path_wrong"].missing_evidence == []


def test_node_not_ready_evaluates_with_named_evidence_and_event_signal() -> None:
    plan = plan_for("NodeNotReady")
    bundle = EvidenceBundle(
        incident_id="inc-node",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={
                    "nodes": [{"name": "worker-1", "conditions": [{"type": "Ready"}]}],
                    "events": [
                        {
                            "reason": "KubeletNotReady",
                            "message": "node is not ready: kubelet stopped posting node status",
                        }
                    ],
                },
                summary="Kubernetes node event",
            ),
            EvidenceItem(
                source="metrics",
                name="telemetry_metrics",
                value={"results": {"node_up": {"value": 0}}},
                summary="Node metric",
            ),
            EvidenceItem(
                source="logs",
                name="related_logs",
                value={"entries": [{"line": "node status update failed"}]},
                summary="Node logs",
            ),
        ],
        missing_evidence=[],
        complete=True,
    )

    by_id = {e.candidate_id: e for e in evaluate_causes(plan.candidates, bundle)}

    assert by_id["kubelet_unavailable"].score == 1.0
    assert by_id["kubelet_unavailable"].missing_evidence == []


def test_failed_mount_pvc_rule_evaluates_with_named_evidence_and_event_signal() -> None:
    plan = plan_for("FailedMount")
    bundle = EvidenceBundle(
        incident_id="inc-volume",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={
                    "pods": [{"name": "checkout-api-0", "namespace": "sandbox"}],
                    "events": [
                        {
                            "reason": "FailedMount",
                            "message": (
                                "pod has unbound immediate PersistentVolumeClaims: "
                                "claim checkout-data is not bound"
                            ),
                        }
                    ],
                },
                summary="Kubernetes volume event",
            ),
            EvidenceItem(
                source="logs",
                name="related_logs",
                value={"entries": [{"line": "persistentvolumeclaim checkout-data not bound"}]},
                summary="Volume logs",
            ),
            EvidenceItem(
                source="metadata",
                name="current_workload_snapshots",
                value={"items": [{"name": "checkout-api"}]},
                summary="Workload snapshots",
            ),
        ],
        missing_evidence=[],
        complete=True,
    )

    by_id = {e.candidate_id: e for e in evaluate_causes(plan.candidates, bundle)}

    assert by_id["pvc_not_bound"].score == 1.0
    assert by_id["pvc_not_bound"].missing_evidence == []


def test_rollout_progress_deadline_evaluates_with_named_evidence_and_event_signal() -> None:
    plan = plan_for("ProgressDeadlineExceeded")
    bundle = EvidenceBundle(
        incident_id="inc-rollout",
        items=[
            evidence_item(
                "kubernetes",
                {
                    "events": [
                        {
                            "reason": "ProgressDeadlineExceeded",
                            "message": "Deployment exceeded its progress deadline",
                        }
                    ]
                },
            ),
            evidence_item("metrics", {"results": {"unavailable_replicas": {"value": 2}}}),
            evidence_item(
                "logs",
                {"entries": [{"line": "rollout exceeded progress deadline for checkout-api"}]},
            ),
            evidence_item("metadata", {"items": [{"name": "checkout-api", "revision": "7"}]}),
        ],
        missing_evidence=[],
        complete=True,
    )

    by_id = {e.candidate_id: e for e in evaluate_causes(plan.candidates, bundle)}

    assert by_id["deployment_progress_deadline_exceeded"].score == 1.0
    assert by_id["deployment_progress_deadline_exceeded"].missing_evidence == []


def test_database_config_error_evaluates_with_named_evidence_and_log_signal() -> None:
    plan = plan_for("DB connection failed")
    bundle = EvidenceBundle(
        incident_id="inc-db",
        items=[
            evidence_item("kubernetes", {"pods": [{"name": "checkout-api-1"}], "events": []}),
            evidence_item(
                "logs",
                {"entries": [{"line": "password authentication failed for user checkout"}]},
            ),
            evidence_item("metadata", {"items": [{"name": "checkout-api", "secretRefs": ["db"]}]}),
            EvidenceItem(
                source="metadata",
                name="referenced_config_objects",
                value={
                    "items": [
                        {
                            "kind": "Secret",
                            "namespace": "sandbox",
                            "name": "db-credentials",
                            "found": True,
                        }
                    ]
                },
                summary="DB Secret reference snapshot",
            ),
        ],
        missing_evidence=[],
        complete=True,
    )

    by_id = {e.candidate_id: e for e in evaluate_causes(plan.candidates, bundle)}

    assert by_id["database_credential_or_config_error"].score == 1.0
    assert by_id["database_credential_or_config_error"].missing_evidence == []


def test_database_pool_exhausted_evaluates_with_named_evidence_and_log_signal() -> None:
    plan = plan_for("DB connection failed")
    bundle = EvidenceBundle(
        incident_id="inc-db-pool",
        items=[
            evidence_item("metrics", {"results": {"db_pool_usage": {"value": 1.0}}}),
            evidence_item(
                "logs",
                {"entries": [{"line": "connection pool exhausted while acquiring DB client"}]},
            ),
            evidence_item("traces", {"results": {"db_spans": {"error_count": 12}}}),
        ],
        missing_evidence=[],
        complete=True,
    )

    by_id = {e.candidate_id: e for e in evaluate_causes(plan.candidates, bundle)}

    assert by_id["database_connection_pool_exhausted"].score == 1.0
    assert by_id["database_connection_pool_exhausted"].missing_evidence == []


def test_unmatched_symptom_still_reports_rule_missing() -> None:
    plan = plan_for("UnmappedSymptom")

    assert plan.candidates == []
    assert plan.rule_missing is not None
    assert plan.rule_missing.message == "정의된 RCA rule 없음"


NEW_RULE_YAML = dedent(
    """\
    rules:
      - id: "node_not_ready"
        symptoms: ["NodeNotReady"]
        required_sources: ["kubernetes", "metrics"]
        candidates:
          - candidate_id: "kubelet_down"
            title: "kubelet 중단"
            description: "노드 kubelet 프로세스가 중단되어 NodeNotReady 가 됐을 가능성이 있습니다."
            expected_evidence: ["kubernetes", "metrics"]
            checks:
              - "Node.status.conditions Ready=False reason 확인"
              - "kubelet process/heartbeat metric 확인"
    """
)


def test_new_yaml_only_rule_becomes_active(tmp_path: Path) -> None:
    """(b) YAML 파일만 추가하면(코드 수정 없이) 새 룰이 활성화되어야 한다."""
    (tmp_path / "node.yaml").write_text(NEW_RULE_YAML, encoding="utf-8")

    profiles = load_catalog_profiles(tmp_path)
    plan = plan_causes(
        incident_for("NodeNotReady"),
        empty_bundle(),
        "object://evidence/catalog.json",
        rules=cause_rules(profiles=profiles),
    )

    assert plan.rule_missing is None
    assert [c.candidate_id for c in plan.candidates] == ["kubelet_down"]
    assert required_evidence_sources(
        incident_for("NodeNotReady"), rules=evidence_rules(profiles=profiles)
    ) == ["kubernetes", "metrics"]


SIGNAL_RULE_YAML = dedent(
    """\
    rules:
      - id: "node_disk_pressure"
        symptoms: ["NodeDiskPressure"]
        required_sources: ["kubernetes"]
        candidates:
          - candidate_id: "disk_full"
            title: "노드 디스크 포화"
            description: "노드 디스크가 가득 차 파드가 축출됐을 가능성이 있습니다."
            expected_evidence: ["kubernetes"]
            checks:
              - "Node.status.conditions DiskPressure 확인"
            signals:
              - id: "disk_pressure_event"
                any_of:
                  - fact: "event_reason=Evicted"
                  - event_pattern: "disk pressure"
    """
)


def test_yaml_signals_load_into_candidate(tmp_path: Path) -> None:
    """signals 블록이 스키마 검증을 거쳐 후보의 판별 신호로 로딩된다."""
    (tmp_path / "node_disk.yaml").write_text(SIGNAL_RULE_YAML, encoding="utf-8")

    profiles = load_catalog_profiles(tmp_path)
    plan = plan_causes(
        incident_for("NodeDiskPressure"),
        empty_bundle(),
        "object://evidence/catalog.json",
        rules=cause_rules(profiles=profiles),
    )

    assert plan.candidates[0].signals == [
        {
            "id": "disk_pressure_event",
            "any_of": [{"fact": "event_reason=Evicted"}, {"event_pattern": "disk pressure"}],
        }
    ]


def test_signal_matcher_with_multiple_keys_fails_at_startup(tmp_path: Path) -> None:
    """matcher 는 fact/log_pattern/event_pattern 중 정확히 하나 — 위반 시 기동 실패."""
    broken = SIGNAL_RULE_YAML.replace(
        '- fact: "event_reason=Evicted"',
        '- {fact: "event_reason=Evicted", log_pattern: "disk"}',
    )
    (tmp_path / "broken_signal.yaml").write_text(broken, encoding="utf-8")

    with pytest.raises(CauseCatalogError, match="RCA 룰 카탈로그 스키마 위반: broken_signal.yaml"):
        load_catalog_profiles(tmp_path)


def test_malformed_yaml_raises_clear_startup_error(tmp_path: Path) -> None:
    """(c) 깨진 YAML 은 기동 시점에 한국어 오류로 즉시 실패해야 한다."""
    (tmp_path / "broken.yaml").write_text("rules: [", encoding="utf-8")

    with pytest.raises(CauseCatalogError, match="RCA 룰 카탈로그 YAML 파싱 실패: broken.yaml"):
        load_catalog_profiles(tmp_path)


def test_schema_violation_raises_clear_startup_error(tmp_path: Path) -> None:
    """(c) 스키마 위반(필수 필드 누락)도 한국어 오류로 즉시 실패해야 한다."""
    (tmp_path / "invalid.yaml").write_text(
        dedent(
            """\
            rules:
              - id: "no_symptoms"
                required_sources: ["kubernetes"]
                candidates: []
            """
        ),
        encoding="utf-8",
    )

    with pytest.raises(CauseCatalogError, match="RCA 룰 카탈로그 스키마 위반: invalid.yaml"):
        load_catalog_profiles(tmp_path)


def test_duplicate_rule_id_within_catalog_raises(tmp_path: Path) -> None:
    """(d) 카탈로그 안에서 rule id 가 중복되면 실패해야 한다."""
    (tmp_path / "a.yaml").write_text(NEW_RULE_YAML, encoding="utf-8")
    (tmp_path / "b.yaml").write_text(NEW_RULE_YAML, encoding="utf-8")

    with pytest.raises(CauseCatalogError, match="RCA 룰 id 중복: 'node_not_ready'"):
        load_catalog_profiles(tmp_path)


def test_duplicate_rule_id_against_registered_rules_raises(tmp_path: Path) -> None:
    """(d) 이미 등록된 룰과 같은 id 의 YAML 룰은 병합 시점에 실패해야 한다."""
    registered_cause_profiles()  # 내장 카탈로그 등록 보장
    (tmp_path / "dup.yaml").write_text(
        NEW_RULE_YAML.replace("node_not_ready", "crashloop_backoff"), encoding="utf-8"
    )
    before = len(CAUSE_PROFILES)

    with pytest.raises(CauseCatalogError, match="RCA 룰 id 중복: 'crashloop_backoff'"):
        register_catalog_profiles(tmp_path)

    assert len(CAUSE_PROFILES) == before  # 실패 시 레지스트리가 오염되지 않아야 한다
