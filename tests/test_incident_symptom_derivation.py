"""incident symptom 승격 테스트 — 에이전트 snapshot 신호 → 카탈로그 symptom 유도.

src/samples/scenarios/faults/*.yaml 의 6개 장애 클래스(crashloop, oom, imagepull,
probe-fail, sched-fail, svc-selector) 각각에 대해 에이전트 kubernetes snapshot
(요약 스키마: src/services/target/cluster-agent/providers/kubernetes_providers.py)
모양의 evidence 를 만들고 검증한다:
(a) 유도된 symptom 이 카탈로그(causes/catalog/*.yaml) 키와 일치한다.
(b) plan_causes 가 rule-missing 없이 원인 후보를 낸다.
(c) crashloop snapshot 은 golden path 로 rca.completed 까지 도달한다.
추가로 명시 symptom 보존(명시 > 유도), 애매한 snapshot 의 unknown 폴백,
다중 장애 파드의 우선순위/secondary_symptoms 보존을 검증한다.
"""

from __future__ import annotations

from typing import Any

import pytest
from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.rca.events import ClusterEvidenceReceivedBody

CLUSTER_ID = "target-cluster-01"
WORKSPACE_ID = "workspace-1"
NAMESPACE = "sandbox"


def pod(
    name: str,
    *,
    phase: str = "Running",
    owner: tuple[str, str] | None = None,
    restarts: int = 0,
    waiting: tuple[str, ...] = (),
    terminated: tuple[str, ...] = (),
    ready: bool = True,
    node: str | None = "node-a",
    labels: dict[str, str] | None = None,
    containers: tuple[dict[str, Any], ...] = (),
) -> dict[str, Any]:
    """kubernetes_providers.pod_summary 출력과 같은 모양의 pod 요약."""
    owner_kind, owner_name = owner if owner else (None, None)
    return {
        "uid": f"uid-{name}",
        "name": name,
        "namespace": NAMESPACE,
        "node_name": node,
        "phase": phase,
        "reason": None,
        "message": None,
        "start_time": "2026-07-07T09:00:00+00:00",
        "labels": labels or {},
        "owner_kind": owner_kind,
        "owner_name": owner_name,
        "workload_key": f"{NAMESPACE}/{owner_kind}/{owner_name}" if owner else None,
        "pod_ip": "10.1.0.7",
        "host_ip": "10.0.0.1",
        "conditions": [{"type": "Ready", "status": "True" if ready else "False"}],
        "containers": list(containers),
        "restart_total": restarts,
        "waiting_reasons": list(waiting),
        "terminated_reasons": list(terminated),
    }


def crashed_container(name: str, *, last_exit_code: int, last_reason: str = "Error") -> dict:
    """crashloop 컨테이너 요약 — 현재 waiting, 직전 크래시 종료 코드는 lastState 에 보존."""
    return {
        "name": name,
        "image": f"ghcr.io/shop-demo/{name}:v1",
        "ready": False,
        "restart_count": 7,
        "state": "waiting",
        "state_reason": "CrashLoopBackOff",
        "state_message": "back-off 5m0s restarting failed container",
        "exit_code": None,
        "started_at": None,
        "finished_at": None,
        "last_state": "terminated",
        "last_state_reason": last_reason,
        "last_exit_code": last_exit_code,
    }


def warning_event(
    reason: str,
    message: str,
    *,
    involved: tuple[str, str],
    count: int = 1,
) -> dict[str, Any]:
    """kubernetes_providers.event_summary 출력과 같은 모양의 warning 이벤트 요약."""
    kind, name = involved
    return {
        "uid": f"uid-event-{reason}-{name}",
        "namespace": NAMESPACE,
        "type": "Warning",
        "reason": reason,
        "message": message,
        "count": count,
        "first_timestamp": "2026-07-07T09:00:00+00:00",
        "last_timestamp": "2026-07-07T09:05:00+00:00",
        "reporting_component": "kubelet",
        "involved_kind": kind,
        "involved_name": name,
        "involved_uid": f"uid-{name}",
    }


def snapshot(
    *,
    pods: tuple[dict[str, Any], ...] = (),
    events: tuple[dict[str, Any], ...] = (),
    services: tuple[dict[str, Any], ...] = (),
    endpoints: tuple[dict[str, Any], ...] = (),
) -> dict[str, Any]:
    """에이전트 KubernetesSnapshotProvider 가 보내는 kubernetes evidence 모양."""
    return {
        "cluster": {"cluster_id": CLUSTER_ID, "namespace": NAMESPACE},
        "workloads": [],
        "pods": list(pods),
        "events": list(events),
        "nodes": [{"name": "node-a", "ready": True}],
        "services": list(services),
        "endpoints": list(endpoints),
        "provider_status": {},
    }


def evidence_payload(
    kubernetes: dict[str, Any],
    *,
    metrics: dict[str, Any] | None = None,
    logs: list[dict[str, Any]] | None = None,
) -> ClusterEvidenceReceivedBody:
    return ClusterEvidenceReceivedBody(
        cluster_id=CLUSTER_ID,
        workspace_id=WORKSPACE_ID,
        kubernetes=kubernetes,
        metrics=metrics or {},
        logs=logs or [],
        traces={},
    )


def run_to_plan(payload: ClusterEvidenceReceivedBody, correlation_id: str) -> list[Any]:
    evidence_worker = load_service("ai/evidence-worker")
    incident_worker = load_service("ai/incident-worker")
    plan_worker = load_service("ai/plan-worker")
    db = SpyDb()

    evidence_outs = run_handler(
        evidence_worker.on_cluster_evidence, payload, db=db, correlation_id=correlation_id
    )
    incident_outs = run_handler(
        incident_worker.on_evidence_built, evidence_outs[0], db=db, correlation_id=correlation_id
    )
    if incident_outs[-1].__subject__ != "evidence.bundle.built":
        return evidence_outs + incident_outs
    plan_outs = run_handler(plan_worker.on_evidence_bundle_built, incident_outs[-1])
    return evidence_outs + incident_outs + plan_outs


def event_by_subject(events: list[Any], subject: str) -> Any:
    return next(event for event in events if event.__subject__ == subject)


# fault 클래스별 snapshot fixture — src/samples/scenarios/faults/*.yaml 의 기대 증상 재현.
CRASHLOOP_SNAPSHOT = snapshot(
    pods=(
        pod(
            "payment-gateway-7d9f8c5b6-x2k4p",
            owner=("ReplicaSet", "payment-gateway-7d9f8c5b6"),
            restarts=7,
            waiting=("CrashLoopBackOff",),
            ready=False,
        ),
    ),
    events=(
        warning_event(
            "BackOff",
            "Back-off restarting failed container payment-gateway in pod "
            "payment-gateway-7d9f8c5b6-x2k4p_sandbox",
            involved=("Pod", "payment-gateway-7d9f8c5b6-x2k4p"),
            count=12,
        ),
    ),
)

OOM_SNAPSHOT = snapshot(
    pods=(
        pod(
            "report-generator-6c4b7d9f4-r8m2s",
            owner=("ReplicaSet", "report-generator-6c4b7d9f4"),
            restarts=5,
            terminated=("OOMKilled",),
            ready=False,
        ),
    ),
)

IMAGEPULL_SNAPSHOT = snapshot(
    pods=(
        pod(
            "search-indexer-58fd6b9c77-q7v3n",
            phase="Pending",
            owner=("ReplicaSet", "search-indexer-58fd6b9c77"),
            waiting=("ImagePullBackOff",),
            ready=False,
        ),
    ),
    events=(
        warning_event(
            "Failed",
            'Failed to pull image "ghcr.io/shop-demo/search-indexer:v2.4.1": manifest unknown',
            involved=("Pod", "search-indexer-58fd6b9c77-q7v3n"),
            count=6,
        ),
    ),
)

PROBE_FAIL_SNAPSHOT = snapshot(
    pods=(
        pod(
            "inventory-api-7b6f9d8c54-w9t1z",
            owner=("ReplicaSet", "inventory-api-7b6f9d8c54"),
            ready=False,
        ),
    ),
    events=(
        warning_event(
            "Unhealthy",
            'Readiness probe failed: Get "http://10.1.0.7:9090/": dial tcp 10.1.0.7:9090: '
            "connect: connection refused",
            involved=("Pod", "inventory-api-7b6f9d8c54-w9t1z"),
            count=9,
        ),
    ),
)

SCHED_FAIL_SNAPSHOT = snapshot(
    pods=(
        pod(
            "analytics-batch-5d8c7b6f9-h4j6k",
            phase="Pending",
            owner=("ReplicaSet", "analytics-batch-5d8c7b6f9"),
            ready=False,
            node=None,
        ),
    ),
    events=(
        warning_event(
            "FailedScheduling",
            "0/2 nodes are available: 2 node(s) didn't match Pod's node affinity/selector.",
            involved=("Pod", "analytics-batch-5d8c7b6f9-h4j6k"),
            count=4,
        ),
    ),
)

SVC_SELECTOR_SNAPSHOT = snapshot(
    pods=(
        pod(
            "checkout-client-6f8d9c7b5-p3n8m",
            owner=("ReplicaSet", "checkout-client-6f8d9c7b5"),
            labels={"app": "checkout-client"},
        ),
    ),
    services=(
        {
            "namespace": NAMESPACE,
            "name": "checkout-gateway",
            "type": "ClusterIP",
            "cluster_ip": "10.96.0.42",
            "ports": [{"port": 80, "targetPort": 8080}],
            "selector": {"app": "checkout-gateway-v2"},
        },
    ),
    endpoints=(
        {
            "namespace": NAMESPACE,
            "name": "checkout-gateway-8x7kq",
            "address_type": "IPv4",
            "endpoint_count": 0,
            "ports": [],
        },
    ),
)

# fault → (snapshot, 기대 symptom, 기대 후보 id 목록) — 카탈로그 YAML 과 정합해야 한다.
FAULT_CASES: dict[str, tuple[dict[str, Any], str, list[str]]] = {
    "crashloop": (
        CRASHLOOP_SNAPSHOT,
        "CrashLoopBackOff",
        [
            "oom_killed",
            "bad_image_rollout",
            "config_env_error",
            "app_startup_failure",
            "dependency_connection_failure",
        ],
    ),
    "oom": (
        OOM_SNAPSHOT,
        "CrashLoopBackOff",  # OOMKilled 는 crashloop 룰 계열(oom_killed 후보)로 수렴
        [
            "oom_killed",
            "bad_image_rollout",
            "config_env_error",
            "app_startup_failure",
            "dependency_connection_failure",
        ],
    ),
    "imagepull": (
        IMAGEPULL_SNAPSHOT,
        "ImagePullBackOff",
        ["wrong_image_tag", "missing_image_pull_secret", "registry_unavailable"],
    ),
    "probe-fail": (
        PROBE_FAIL_SNAPSHOT,
        "Ingress 502/503",  # backend readiness 실패 계열 — ingress_5xx 룰이 다룬다
        ["upstream_unavailable", "backend_readiness_failure"],
    ),
    "sched-fail": (
        SCHED_FAIL_SNAPSHOT,
        "FailedScheduling",
        [
            "insufficient_cpu",
            "insufficient_memory",
            "node_affinity_or_taint_mismatch",
            "pvc_pending",
        ],
    ),
    "svc-selector": (
        SVC_SELECTOR_SNAPSHOT,
        "Ingress 502/503",  # 빈 endpoint 배선 문제 — upstream_unavailable 후보와 정합
        ["upstream_unavailable", "backend_readiness_failure"],
    ),
}


@pytest.mark.parametrize("fault", sorted(FAULT_CASES))
def test_fault_snapshot_derives_catalog_symptom_and_plans_candidates(fault: str) -> None:
    """(a)+(b) — snapshot 신호만으로 카탈로그 symptom 이 유도되고 후보가 계획된다."""
    fault_snapshot, expected_symptom, expected_candidates = FAULT_CASES[fault]

    events = run_to_plan(evidence_payload(fault_snapshot), correlation_id=f"corr-{fault}")

    assert subjects_of(events) == [
        "evidence.built",
        "incident.detected",
        "evidence.bundle.built",
        "rca.candidates.planned",
    ]
    detected = event_by_subject(events, "incident.detected")
    assert detected.detected is True
    assert detected.incident.symptom == expected_symptom
    assert detected.incident.namespace == NAMESPACE

    planned = event_by_subject(events, "rca.candidates.planned")
    assert planned.rule_missing is None
    assert planned.candidate_count == len(expected_candidates)
    assert [candidate.candidate_id for candidate in planned.candidates] == expected_candidates


def test_derived_incident_targets_dominant_pod_owner() -> None:
    """resource 명시가 없으면 지배 신호 파드의 소유 워크로드가 incident 대상이 된다."""
    events = run_to_plan(evidence_payload(CRASHLOOP_SNAPSHOT), correlation_id="corr-owner")

    incident = event_by_subject(events, "incident.detected").incident
    assert incident.resource_kind == "ReplicaSet"
    assert incident.resource_name == "payment-gateway-7d9f8c5b6"
    assert incident.summary == "ReplicaSet payment-gateway-7d9f8c5b6 has CrashLoopBackOff"


def run_to_rca_completion(
    payload: ClusterEvidenceReceivedBody,
    *,
    db: SpyDb,
    correlation_id: str,
) -> list[Any]:
    events = run_to_plan(payload, correlation_id=correlation_id)
    analyze_worker = load_service("ai/analyze-worker")
    rca_worker = load_service("ai/rca-worker")
    analyze_outs = run_handler(
        analyze_worker.on_candidates_planned,
        event_by_subject(events, "rca.candidates.planned"),
    )
    rca_outs = run_handler(
        rca_worker.on_candidates_evaluated, analyze_outs[0], db=db, correlation_id=correlation_id
    )
    return events + analyze_outs + rca_outs


GOLDEN_PATH_SUBJECTS = [
    "evidence.built",
    "incident.detected",
    "evidence.bundle.built",
    "rca.candidates.planned",
    "rca.candidates.evaluated",
    "rca.completed",
]


def evaluation_by_id(completed: Any, candidate_id: str) -> Any:
    return next(e for e in completed.evaluations if e.candidate_id == candidate_id)


def test_exit1_crashloop_with_config_log_completes_as_config_env_error() -> None:
    """(c) — exit 1 크래시(환경변수 누락 FATAL 로그, OOM 신호 없음)는 oom_killed 가 아니라
    설정 오류 후보로 완결된다(운영에서 관측된 오판의 회귀 테스트)."""
    payload = evidence_payload(
        CRASHLOOP_SNAPSHOT,
        metrics={"container_memory_working_set_bytes": "near-limit"},
        logs=[{"line": "FATAL: required environment variable DATABASE_URL is not set"}],
    )
    db = SpyDb()

    events = run_to_rca_completion(payload, db=db, correlation_id="corr-golden")

    assert subjects_of(events) == GOLDEN_PATH_SUBJECTS
    completed = events[-1]
    assert completed.root_cause == "config_env_error"
    assert completed.rca_detail.confidence == 1.0
    assert completed.incident.symptom == "CrashLoopBackOff"
    assert db.called("save_rca_report")
    # oom_killed 는 양성 OOM 근거(signal) 미충족으로 완결 점수에 도달하지 못한다.
    oom = evaluation_by_id(completed, "oom_killed")
    assert oom.score < 1.0
    assert "signal:oom_evidence" in oom.missing_evidence


def test_true_oom_crashloop_completes_as_oom_killed() -> None:
    """(c) — 진짜 OOM(terminated=OOMKilled + exit 137 + OOM 로그)은 oom_killed 로 완결된다."""
    oom_snapshot = snapshot(
        pods=(
            pod(
                "report-generator-6c4b7d9f4-r8m2s",
                owner=("ReplicaSet", "report-generator-6c4b7d9f4"),
                restarts=5,
                terminated=("OOMKilled",),
                ready=False,
                containers=(
                    crashed_container(
                        "report-generator", last_exit_code=137, last_reason="OOMKilled"
                    ),
                ),
            ),
        ),
    )
    payload = evidence_payload(
        oom_snapshot,
        metrics={"container_memory_working_set_bytes": "near-limit"},
        logs=[{"line": "java.lang.OutOfMemoryError: Java heap space"}],
    )
    db = SpyDb()

    events = run_to_rca_completion(payload, db=db, correlation_id="corr-oom")

    assert subjects_of(events) == GOLDEN_PATH_SUBJECTS
    completed = events[-1]
    assert completed.root_cause == "oom_killed"
    assert completed.rca_detail.confidence == 1.0
    assert db.called("save_rca_report")


def test_generic_exit1_crash_without_config_log_selects_app_startup_failure() -> None:
    """(c) — 설정 오류 로그 패턴이 없는 일반 exit 1 크래시(FATAL 로그)는
    app_startup_failure 로 판별된다(exit_code=non_oom fact 기반)."""
    exit1_snapshot = snapshot(
        pods=(
            pod(
                "payment-gateway-7d9f8c5b6-x2k4p",
                owner=("ReplicaSet", "payment-gateway-7d9f8c5b6"),
                restarts=7,
                waiting=("CrashLoopBackOff",),
                ready=False,
                containers=(crashed_container("payment-gateway", last_exit_code=1),),
            ),
        ),
    )
    payload = evidence_payload(
        exit1_snapshot,
        logs=[{"line": "FATAL: unexpected failure during startup"}],
    )
    db = SpyDb()

    events = run_to_rca_completion(payload, db=db, correlation_id="corr-exit1")

    assert subjects_of(events) == GOLDEN_PATH_SUBJECTS
    completed = events[-1]
    assert completed.root_cause == "app_startup_failure"
    assert completed.root_cause != "oom_killed"
    oom = evaluation_by_id(completed, "oom_killed")
    assert "signal:oom_evidence" in oom.missing_evidence


def test_explicit_symptom_always_beats_derived_signals() -> None:
    """명시 > 유도 — webhook 등이 실어 준 symptom 은 snapshot 신호로 덮지 않는다."""
    kubernetes = {
        **IMAGEPULL_SNAPSHOT,
        "resource": {"kind": "deployment", "name": "checkout-api", "namespace": NAMESPACE},
        "symptom": "DB connection failed",
    }

    events = run_to_plan(evidence_payload(kubernetes), correlation_id="corr-explicit")

    incident = event_by_subject(events, "incident.detected").incident
    assert incident.symptom == "DB connection failed"
    assert incident.secondary_symptoms == []
    assert incident.resource_name == "checkout-api"


def test_ambiguous_snapshot_does_not_open_incident() -> None:
    """신호가 전혀 없는 정상 snapshot 은 RCA 분석으로 승격하지 않는다."""
    healthy = snapshot(
        pods=(pod("healthy-api-1", labels={"app": "healthy-api"}),),
        services=(
            {
                "namespace": NAMESPACE,
                "name": "healthy-api",
                "type": "ClusterIP",
                "cluster_ip": "10.96.0.7",
                "ports": [],
                "selector": {"app": "healthy-api"},
            },
        ),
        endpoints=(
            {
                "namespace": NAMESPACE,
                "name": "healthy-api-abc12",
                "address_type": "IPv4",
                "endpoint_count": 1,
                "ports": [],
            },
        ),
    )

    events = run_to_plan(evidence_payload(healthy), correlation_id="corr-ambiguous")

    assert subjects_of(events) == [
        "evidence.built",
        "incident.detected",
    ]
    detected = event_by_subject(events, "incident.detected")
    assert detected.detected is False
    assert detected.incident.symptom == "unknown"
    assert detected.incident.secondary_symptoms == []


def test_multiple_failing_pods_pick_dominant_signal_and_keep_the_rest() -> None:
    """다중 장애 — 우선순위(imagepull > crashloop > oom)가 대표를 정하고 나머지는 보존."""
    mixed = snapshot(
        pods=(
            pod(
                "report-generator-1",
                owner=("ReplicaSet", "report-generator-6c4b"),
                restarts=5,
                terminated=("OOMKilled",),
                ready=False,
            ),
            pod(
                "payment-gateway-1",
                owner=("ReplicaSet", "payment-gateway-7d9f"),
                restarts=9,
                waiting=("CrashLoopBackOff",),
                ready=False,
            ),
            pod(
                "search-indexer-1",
                phase="Pending",
                owner=("ReplicaSet", "search-indexer-58fd"),
                waiting=("ImagePullBackOff",),
                ready=False,
            ),
        ),
    )

    events = run_to_plan(evidence_payload(mixed), correlation_id="corr-mixed")

    incident = event_by_subject(events, "incident.detected").incident
    assert incident.symptom == "ImagePullBackOff"
    assert incident.secondary_symptoms == ["CrashLoopBackOff", "OOMKilled"]
    assert incident.resource_name == "search-indexer-58fd"
