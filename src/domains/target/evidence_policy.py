from __future__ import annotations

from packages.config.constants import Target
from packages.contracts.gateway.requests import (
    AgentPolicy,
    BootstrapPolicy,
    DesiredStatePolicy,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
)

DEFAULT_EVIDENCE_FAILURE_POLICY = "allow_partial"
DEFAULT_EVIDENCE_PROVIDER_WORKERS = 1
DEFAULT_EVIDENCE_PROVIDER_MAX_WORKERS = 2
DEFAULT_CLUSTER_ROLE = "target"
MANAGEMENT_CLUSTER_ROLE = "management"
DEFAULT_BOOTSTRAP_MODE = "target"
MANAGEMENT_DEFAULT_EVIDENCE_PROVIDERS = {"kubernetes"}
MANAGEMENT_EVIDENCE_PROVIDER_QUERIES: dict[str, list[dict[str, str]]] = {
    "kubernetes": [
        {
            "name": "management_namespace_snapshot",
            "description": (
                "Kubernetes pods, events, nodes, workloads, services, and endpoint slices "
                "in the management namespace."
            ),
            "query": "management",
        }
    ]
}

# Default evidence queries sent to each provider.
# These values seed the agent policy for a target cluster.
DEFAULT_EVIDENCE_PROVIDER_QUERIES: dict[str, list[dict[str, str]]] = {
    "kubernetes": [
        {
            "name": "target_namespace_snapshot",
            "description": "Kubernetes pods, events, nodes, workloads, services, and endpoint slices in the target namespace.",
            "query": "target",
        },
        {
            # 데모/장애주입 워크로드는 sandbox 네임스페이스에 배포된다 — 이 snapshot 이
            # 없으면 sandbox 장애의 incident 가 탐지되지 않거나 target 관측 스택 신호로 오염된다.
            "name": "sandbox_namespace_snapshot",
            "description": "Kubernetes pods, events, nodes, workloads, services, and endpoint slices in the sandbox namespace.",
            "query": "sandbox",
        },
        {
            # 실제 게임 데모는 격리된 color-turf 네임스페이스에서 실행된다. Pod 재시작,
            # OOMKilled 종료 상태, Kubernetes Event를 같은 실제 evidence 파이프라인으로
            # 수집해야 장애 버튼부터 incident/RCA까지 단절되지 않는다.
            "name": "color_turf_namespace_snapshot",
            "description": "Kubernetes pods, events, nodes, workloads, services, and endpoint slices in the color-turf namespace.",
            "query": "color-turf",
        },
    ],
    "metrics": [
        {
            "name": "scrape_targets_up",
            "description": "Prometheus scrape target health for the target cluster.",
            "query": "up",
        },
        {
            "name": "target_pod_info",
            "description": "Pods discovered by kube-state-metrics in the target namespace.",
            "query": 'kube_pod_info{namespace="target"}',
        },
        {
            "name": "target_deployment_replicas",
            "description": "Deployment replica counts reported by kube-state-metrics.",
            "query": 'kube_deployment_status_replicas{namespace="target"}',
        },
        {
            "name": "color_turf_pod_restarts",
            "description": "Container restart counts for the live color-turf game workloads.",
            "query": 'kube_pod_container_status_restarts_total{namespace="color-turf"}',
        },
        {
            "name": "color_turf_oom_terminated",
            "description": "Containers in color-turf whose latest termination reason is OOMKilled.",
            "query": 'kube_pod_container_status_last_terminated_reason{namespace="color-turf",reason="OOMKilled"}',
        },
        {
            "name": "node_cpu_usage_ratio",
            "description": "Node CPU usage ratio from Prometheus node-exporter metrics.",
            "query": '1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))',
        },
        {
            "name": "node_memory_usage_ratio",
            "description": "Node memory usage ratio from Prometheus node-exporter metrics.",
            "query": "1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
        },
        {
            "name": "node_filesystem_usage_ratio",
            "description": "Node filesystem usage ratio from Prometheus node-exporter metrics.",
            "query": (
                '1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"} '
                '/ node_filesystem_size_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"})'
            ),
        },
        {
            "name": "node_collector_node_pod_count",
            "description": "Pods scheduled on each Kubernetes node reported by optional-node-collector.",
            "query": "node_collector_node_pod_count",
            "range_seconds": "900",
            "step_seconds": "30",
        },
        {
            "name": "node_collector_node_not_ready_pod_count",
            "description": (
                "Not Ready Pods on each Kubernetes node reported by optional-node-collector."
            ),
            "query": "node_collector_node_not_ready_pod_count",
            "range_seconds": "900",
            "step_seconds": "30",
        },
        {
            "name": "node_collector_scrape_error",
            "description": "Whether optional-node-collector failed to read Kubernetes API data.",
            "query": "node_collector_scrape_error",
        },
    ],
    "logs": [
        {
            "name": "target_namespace_errors",
            "description": "Error logs emitted by workloads in the target namespace.",
            "query": '{k8s_namespace_name="target"} |= "ERROR"',
        },
        {
            # sandbox 워크로드(장애주입 대상)의 오류 로그 — RCA 리포트 근거의 1차 소스.
            # FATAL(치명 시작 실패)·panic 도 함께 잡아 crashloop 원인 판별 신호를 확보한다.
            "name": "sandbox_namespace_errors",
            "description": "Error/fatal logs emitted by workloads in the sandbox namespace.",
            "query": '{k8s_namespace_name="sandbox"} |~ "ERROR|FATAL|panic"',
        },
        {
            "name": "color_turf_runtime_failures",
            "description": "OOM, fatal, and explicit chaos events emitted by the live color-turf game workloads.",
            "query": (
                '{k8s_namespace_name="color-turf"} '
                '|~ "OOM|out of memory|chaos.oom|ERROR|FATAL|panic"'
            ),
        },
        {
            "name": "node_collector_runtime_samples",
            "description": "Structured runtime samples emitted by optional-node-collector.",
            "query": (
                '{k8s_namespace_name="target", k8s_container_name="node-collector"} '
                '|= "node_runtime_sample"'
            ),
        },
        {
            "name": "target_agent_warnings",
            "description": "Warnings or failures emitted by the target-cluster-agent.",
            "query": (
                '{k8s_namespace_name="target", k8s_container_name="cluster-agent"} '
                '|~ "WARN|ERROR|failed"'
            ),
        },
    ],
    "traces": [
        {
            "name": "application_error_spans",
            "description": "Recent application spans that ended with an error status.",
            "query": "{ status = error }",
        },
        {
            "name": "target_agent_error_spans",
            "description": "Error spans emitted by the target-cluster-agent.",
            "query": '{ resource.service.name = "target-cluster-agent" && status = error }',
        },
        {
            "name": "target_agent_recent_spans",
            "description": "Recent spans emitted by the target-cluster-agent evidence loop.",
            "query": '{ resource.service.name = "target-cluster-agent" }',
        },
        {
            "name": "management_gateway_spans",
            "description": "Management Gateway request spans related to agent traffic.",
            "query": '{ resource.service.name = "api-gateway" }',
        },
    ],
    "metadata": [
        {
            "name": "change_context",
            "description": "Change context metadata for RCA",
            "query": "change_context",
        },
    ],
}


def default_evidence_provider_policy(
    provider_key: str,
    interval_seconds: int,
    *,
    enabled: bool = True,
    queries: list[dict[str, str]] | None = None,
) -> EvidenceProviderPolicy:
    """Build the default policy for one evidence provider."""
    return EvidenceProviderPolicy(
        enabled=enabled,
        interval_seconds=interval_seconds,
        min_workers=DEFAULT_EVIDENCE_PROVIDER_WORKERS,
        max_workers=DEFAULT_EVIDENCE_PROVIDER_MAX_WORKERS,
        queries=list(
            DEFAULT_EVIDENCE_PROVIDER_QUERIES.get(provider_key, []) if queries is None else queries
        ),
    )


def default_evidence_providers(
    interval_seconds: int,
    *,
    cluster_role: str = DEFAULT_CLUSTER_ROLE,
) -> dict[str, EvidenceProviderPolicy]:
    """Build default provider policies for all known providers."""
    return {
        provider_key: default_evidence_provider_policy(
            provider_key,
            interval_seconds,
            enabled=(
                cluster_role != MANAGEMENT_CLUSTER_ROLE
                or provider_key in MANAGEMENT_DEFAULT_EVIDENCE_PROVIDERS
            ),
            queries=(
                MANAGEMENT_EVIDENCE_PROVIDER_QUERIES.get(provider_key, [])
                if cluster_role == MANAGEMENT_CLUSTER_ROLE
                else None
            ),
        )
        for provider_key in DEFAULT_EVIDENCE_PROVIDER_QUERIES
    }


def default_agent_policy(
    *,
    cluster_id: str,
    cluster_role: str = DEFAULT_CLUSTER_ROLE,
    interval_seconds: int = int(Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS),
    failure_policy: str = DEFAULT_EVIDENCE_FAILURE_POLICY,
    bootstrap_mode: str = DEFAULT_BOOTSTRAP_MODE,
    generation: int = 1,
) -> AgentPolicy:
    """Build the default policy used by a target cluster agent."""
    return AgentPolicy(
        cluster_id=cluster_id,
        cluster_role=cluster_role,
        generation=generation,
        evidence=EvidenceRuntimePolicy(
            failure_policy=failure_policy,
            providers=default_evidence_providers(
                interval_seconds,
                cluster_role=cluster_role,
            ),
        ),
        bootstrap=BootstrapPolicy(mode=bootstrap_mode),
        desired_state=DesiredStatePolicy(),
    )


def enabled_provider_keys(policy: AgentPolicy, requested_provider_keys: list[str]) -> list[str]:
    """Return requested provider keys that are enabled by policy."""
    keys: list[str] = []
    for provider_key in dict.fromkeys(requested_provider_keys):
        provider_policy = policy.evidence.providers.get(provider_key)
        if provider_policy is None or provider_policy.enabled:
            keys.append(provider_key)
    return keys


def provider_policy_snapshots(
    policy: AgentPolicy,
    provider_keys: list[str],
) -> dict[str, dict[str, object]]:
    """Return serializable policy data for each queued provider job."""
    return {
        provider_key: policy.evidence.providers.get(
            provider_key,
            EvidenceProviderPolicy(),
        ).model_dump()
        for provider_key in provider_keys
    }
