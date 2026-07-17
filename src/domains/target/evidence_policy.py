from __future__ import annotations

from packages.config.constants import Target
from packages.config.security import RCA_TEST_TARGET_ENVIRONMENTS
from packages.contracts.cost.observations import (
    COST_NAMESPACE_HOURLY_METRIC,
    COST_NAMESPACE_STORAGE_METRIC,
    COST_POD_CPU_HOURLY_METRIC,
    COST_POD_CPU_USE_METRIC,
    COST_POD_MEMORY_HOURLY_METRIC,
    COST_POD_MEMORY_USE_METRIC,
)
from packages.contracts.evidence_policy import (
    EvidencePolicyQuery,
    EvidenceProfile,
    EvidenceQueryProvenance,
    EvidenceQueryScope,
    EvidenceQuerySource,
)
from packages.contracts.gateway.requests import (
    AgentPolicy,
    BootstrapPolicy,
    DesiredStatePolicy,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
)
from packages.contracts.target import (
    KUBERNETES_ALL_NAMESPACES_QUERY,
    KUBERNETES_QUERY_SCOPE_CLUSTER_ACCESS,
    KUBERNETES_QUERY_SCOPE_CLUSTER_DISCOVERY,
    KUBERNETES_QUERY_SCOPE_CLUSTER_EVENTS,
)
from packages.contracts.traffic.observations import (
    TRAFFIC_CARETTA_FLOW_METRIC,
    TRAFFIC_HUBBLE_FLOW_METRIC,
    TRAFFIC_ISTIO_FLOW_METRIC,
)

DEFAULT_EVIDENCE_FAILURE_POLICY = "allow_partial"
DEFAULT_EVIDENCE_PROVIDER_WORKERS = 1
DEFAULT_EVIDENCE_PROVIDER_MAX_WORKERS = 2
DEFAULT_CLUSTER_ROLE = "target"
MANAGEMENT_CLUSTER_ROLE = "management"
DEFAULT_BOOTSTRAP_MODE = "target"
STANDARD_EVIDENCE_PROFILE: EvidenceProfile = "standard"
DEMO_EVIDENCE_PROFILE: EvidenceProfile = "demo"
MANAGEMENT_EVIDENCE_PROFILE: EvidenceProfile = "management"
EVIDENCE_PROVIDER_KEYS = ("kubernetes", "metrics", "logs", "traces", "metadata")

COST_NAMESPACE_HOURLY_QUERY = """sum by (namespace) (
  label_replace(avg_over_time(container_cpu_allocation{namespace!=""}[1h]), "namespace", "$1", "exported_namespace", "(.+)")
  * on(node) group_left() max by (node) (node_cpu_hourly_cost)
) + sum by (namespace) (
  label_replace(avg_over_time(container_memory_allocation_bytes{namespace!=""}[1h]), "namespace", "$1", "exported_namespace", "(.+)")
  / 1073741824 * on(node) group_left() max by (node) (node_ram_hourly_cost)
)"""
COST_NAMESPACE_STORAGE_QUERY = """sum by (namespace) (
  max by (persistentvolume) (pv_hourly_cost)
  * on(persistentvolume) group_left(namespace)
  max by (persistentvolume, namespace) (
    label_replace(kube_persistentvolume_claim_ref{claim_namespace!=""}, "namespace", "$1", "claim_namespace", "(.+)")
  )
)"""
COST_POD_CPU_HOURLY_QUERY = """sum by (namespace, pod) (
  avg_over_time(container_cpu_allocation{namespace!="",pod!=""}[1h])
  * on(node) group_left() max by (node) (node_cpu_hourly_cost)
)"""
COST_POD_MEMORY_HOURLY_QUERY = """sum by (namespace, pod) (
  avg_over_time(container_memory_allocation_bytes{namespace!="",pod!=""}[1h])
  / 1073741824 * on(node) group_left() max by (node) (node_ram_hourly_cost)
)"""
COST_POD_CPU_USE_QUERY = """clamp_max(
  sum by (namespace, pod) (
    rate(container_cpu_usage_seconds_total{namespace!="",pod!="",container!=""}[5m])
  )
  / clamp_min(sum by (namespace, pod) (
    container_cpu_allocation{namespace!="",pod!=""}
  ), 0.001),
  1
)"""
COST_POD_MEMORY_USE_QUERY = """clamp_max(
  sum by (namespace, pod) (
    avg_over_time(container_memory_working_set_bytes{namespace!="",pod!="",container!=""}[5m])
  )
  / clamp_min(sum by (namespace, pod) (
    avg_over_time(container_memory_allocation_bytes{namespace!="",pod!=""}[5m])
  ), 1),
  1
)"""


def _provenance(
    *,
    cluster_id: str,
    evidence_profile: EvidenceProfile,
    query_scope: EvidenceQueryScope,
    namespaces: tuple[str, ...] = (),
    required_matchers: tuple[str, ...] = (),
) -> EvidenceQueryProvenance:
    return EvidenceQueryProvenance(
        cluster_id=cluster_id,
        evidence_profile=evidence_profile,
        backend_scope="cluster_local",
        query_scope=query_scope,
        namespaces=namespaces,
        required_matchers=required_matchers,
    )


def _query(
    *,
    source: EvidenceQuerySource,
    name: str,
    description: str,
    query: str,
    provenance: EvidenceQueryProvenance,
    collection_scope: str | None = None,
) -> dict[str, object]:
    return EvidencePolicyQuery(
        source=source,
        name=name,
        description=description,
        query=query,
        provenance=provenance,
        collection_scope=collection_scope,
    ).model_dump(mode="json", exclude_none=True)


def _namespace_query(
    *,
    source: EvidenceQuerySource,
    name: str,
    description: str,
    query: str,
    namespace: str,
    cluster_id: str,
    evidence_profile: EvidenceProfile,
    matcher: str | None = None,
) -> dict[str, object]:
    required_matcher = matcher or namespace
    return _query(
        source=source,
        name=name,
        description=description,
        query=query,
        provenance=_provenance(
            cluster_id=cluster_id,
            evidence_profile=evidence_profile,
            query_scope="namespace",
            namespaces=(namespace,),
            required_matchers=(required_matcher,),
        ),
    )


def _cluster_kubernetes_queries(
    cluster_id: str,
    evidence_profile: EvidenceProfile,
) -> list[dict[str, object]]:
    provenance = _provenance(
        cluster_id=cluster_id,
        evidence_profile=evidence_profile,
        query_scope="cluster",
    )
    return [
        _query(
            source="kubernetes",
            name="cluster_wide_event_capture",
            description="Paginated all-namespace Kubernetes Event capture with coverage proof.",
            query=KUBERNETES_ALL_NAMESPACES_QUERY,
            provenance=provenance,
            collection_scope=KUBERNETES_QUERY_SCOPE_CLUSTER_EVENTS,
        ),
        _query(
            source="kubernetes",
            name="cluster_api_discovery",
            description="Discover authorized Kubernetes API resources and CRD identities.",
            query=KUBERNETES_ALL_NAMESPACES_QUERY,
            provenance=provenance,
            collection_scope=KUBERNETES_QUERY_SCOPE_CLUSTER_DISCOVERY,
        ),
        _query(
            source="kubernetes",
            name="cluster_access_snapshot",
            description="Collect complete bounded Kubernetes RBAC reverse-lookup evidence.",
            query=KUBERNETES_ALL_NAMESPACES_QUERY,
            provenance=provenance,
            collection_scope=KUBERNETES_QUERY_SCOPE_CLUSTER_ACCESS,
        ),
    ]


def evidence_provider_queries(
    provider_key: str,
    *,
    cluster_id: str,
    evidence_profile: EvidenceProfile = STANDARD_EVIDENCE_PROFILE,
) -> list[dict[str, object]]:
    """Compile one server-owned provider query set for an exact cluster profile."""

    if evidence_profile == MANAGEMENT_EVIDENCE_PROFILE:
        if provider_key != "kubernetes":
            return []
        return [
            _namespace_query(
                source="kubernetes",
                name="management_namespace_snapshot",
                description="Kubernetes snapshot in the management namespace.",
                query="management",
                namespace="management",
                cluster_id=cluster_id,
                evidence_profile=evidence_profile,
            ),
            *_cluster_kubernetes_queries(cluster_id, evidence_profile),
        ]

    if provider_key == "kubernetes":
        queries = [
            _namespace_query(
                source="kubernetes",
                name="target_namespace_snapshot",
                description="Kubernetes snapshot in the target agent namespace.",
                query="target",
                namespace="target",
                cluster_id=cluster_id,
                evidence_profile=evidence_profile,
            ),
            *_cluster_kubernetes_queries(cluster_id, evidence_profile),
        ]
        if evidence_profile == DEMO_EVIDENCE_PROFILE:
            queries[1:1] = [
                _namespace_query(
                    source="kubernetes",
                    name="sandbox_namespace_snapshot",
                    description="Kubernetes snapshot in the sandbox demo namespace.",
                    query="sandbox",
                    namespace="sandbox",
                    cluster_id=cluster_id,
                    evidence_profile=evidence_profile,
                ),
                _namespace_query(
                    source="kubernetes",
                    name="color_turf_namespace_snapshot",
                    description="Kubernetes snapshot in the color-turf demo namespace.",
                    query="color-turf",
                    namespace="color-turf",
                    cluster_id=cluster_id,
                    evidence_profile=evidence_profile,
                ),
            ]
        return queries

    if provider_key == "metrics":
        cost_provenance = _provenance(
            cluster_id=cluster_id,
            evidence_profile=evidence_profile,
            query_scope="cluster",
            required_matchers=('namespace!=""',),
        )
        cluster_provenance = _provenance(
            cluster_id=cluster_id,
            evidence_profile=evidence_profile,
            query_scope="cluster",
        )
        queries = [
            _namespace_query(
                source="prometheus",
                name="target_pod_info",
                description="Pods reported by kube-state-metrics in the agent namespace.",
                query='kube_pod_info{namespace="target"}',
                namespace="target",
                matcher='namespace="target"',
                cluster_id=cluster_id,
                evidence_profile=evidence_profile,
            ),
            _namespace_query(
                source="prometheus",
                name="target_deployment_replicas",
                description="Deployment replicas in the target agent namespace.",
                query='kube_deployment_status_replicas{namespace="target"}',
                namespace="target",
                matcher='namespace="target"',
                cluster_id=cluster_id,
                evidence_profile=evidence_profile,
            ),
            _query(
                source="prometheus",
                name=COST_NAMESPACE_HOURLY_METRIC,
                description="Namespace CPU and memory allocation hourly rate from OpenCost metrics.",
                query=COST_NAMESPACE_HOURLY_QUERY,
                provenance=cost_provenance,
                collection_scope="cluster_cost_observation",
            ),
            _query(
                source="prometheus",
                name=COST_NAMESPACE_STORAGE_METRIC,
                description="Namespace persistent-volume hourly rate from OpenCost metrics.",
                query=COST_NAMESPACE_STORAGE_QUERY,
                provenance=_provenance(
                    cluster_id=cluster_id,
                    evidence_profile=evidence_profile,
                    query_scope="cluster",
                    required_matchers=('claim_namespace!=""',),
                ),
                collection_scope="cluster_cost_observation",
            ),
            _query(
                source="prometheus",
                name=TRAFFIC_CARETTA_FLOW_METRIC,
                description=(
                    "Caretta flow links collected by the outbound cluster Agent from its "
                    "configured in-cluster Prometheus provider."
                ),
                query=(
                    "max by (client_name, client_namespace, client_kind, server_name, "
                    "server_namespace, server_kind, server_port) (caretta_links_observed)"
                ),
                provenance=cluster_provenance,
            ),
            _query(
                source="prometheus",
                name=TRAFFIC_HUBBLE_FLOW_METRIC,
                description=(
                    "Hubble exported flow counts collected by the outbound cluster Agent "
                    "without a management-plane relay connection."
                ),
                query=(
                    "sum by (source, source_namespace, destination, "
                    "destination_namespace, protocol, verdict) "
                    "(increase(hubble_flows_processed_total[5m]))"
                ),
                provenance=cluster_provenance,
            ),
            _query(
                source="prometheus",
                name=TRAFFIC_ISTIO_FLOW_METRIC,
                description=(
                    "Istio request flows collected by the outbound cluster Agent from its "
                    "configured in-cluster Prometheus provider."
                ),
                query=(
                    "sum by (source_workload, source_workload_namespace, "
                    "destination_workload, destination_workload_namespace, "
                    "destination_service_name, request_protocol, response_code) "
                    '(increase(istio_requests_total{reporter="destination"}[5m]))'
                ),
                provenance=cluster_provenance,
            ),
            _query(
                source="prometheus",
                name=COST_POD_CPU_HOURLY_METRIC,
                description="Pod CPU allocation hourly rate from OpenCost metrics.",
                query=COST_POD_CPU_HOURLY_QUERY,
                provenance=cost_provenance,
                collection_scope="cluster_cost_observation",
            ),
            _query(
                source="prometheus",
                name=COST_POD_MEMORY_HOURLY_METRIC,
                description="Pod memory allocation hourly rate from OpenCost metrics.",
                query=COST_POD_MEMORY_HOURLY_QUERY,
                provenance=cost_provenance,
                collection_scope="cluster_cost_observation",
            ),
            _query(
                source="prometheus",
                name=COST_POD_CPU_USE_METRIC,
                description="Pod CPU use as a bounded fraction of observed allocation.",
                query=COST_POD_CPU_USE_QUERY,
                provenance=cost_provenance,
                collection_scope="cluster_cost_observation",
            ),
            _query(
                source="prometheus",
                name=COST_POD_MEMORY_USE_METRIC,
                description="Pod memory use as a bounded fraction of observed allocation.",
                query=COST_POD_MEMORY_USE_QUERY,
                provenance=cost_provenance,
                collection_scope="cluster_cost_observation",
            ),
        ]
        if evidence_profile == DEMO_EVIDENCE_PROFILE:
            queries.extend(
                [
                    _namespace_query(
                        source="prometheus",
                        name="color_turf_pod_restarts",
                        description="Container restarts in the color-turf demo namespace.",
                        query=('kube_pod_container_status_restarts_total{namespace="color-turf"}'),
                        namespace="color-turf",
                        matcher='namespace="color-turf"',
                        cluster_id=cluster_id,
                        evidence_profile=evidence_profile,
                    ),
                    _namespace_query(
                        source="prometheus",
                        name="color_turf_oom_terminated",
                        description="OOMKilled containers in the color-turf demo namespace.",
                        query=(
                            "kube_pod_container_status_last_terminated_reason"
                            '{namespace="color-turf",reason="OOMKilled"}'
                        ),
                        namespace="color-turf",
                        matcher='namespace="color-turf"',
                        cluster_id=cluster_id,
                        evidence_profile=evidence_profile,
                    ),
                ]
            )
        return queries

    if provider_key == "logs":
        queries = [
            _namespace_query(
                source="loki",
                name="target_namespace_errors",
                description="Error logs in the target agent namespace.",
                query='{k8s_namespace_name="target"} |= "ERROR"',
                namespace="target",
                matcher='k8s_namespace_name="target"',
                cluster_id=cluster_id,
                evidence_profile=evidence_profile,
            ),
            _namespace_query(
                source="loki",
                name="node_collector_runtime_samples",
                description="Structured samples emitted by optional-node-collector.",
                query=(
                    '{k8s_namespace_name="target", k8s_container_name="node-collector"} '
                    '|= "node_runtime_sample"'
                ),
                namespace="target",
                matcher='k8s_namespace_name="target"',
                cluster_id=cluster_id,
                evidence_profile=evidence_profile,
            ),
            _namespace_query(
                source="loki",
                name="target_agent_warnings",
                description="Warnings or failures emitted by the target cluster agent.",
                query=(
                    '{k8s_namespace_name="target", k8s_container_name="cluster-agent"} '
                    '|~ "WARN|ERROR|failed"'
                ),
                namespace="target",
                matcher='k8s_namespace_name="target"',
                cluster_id=cluster_id,
                evidence_profile=evidence_profile,
            ),
        ]
        if evidence_profile == DEMO_EVIDENCE_PROFILE:
            queries.extend(
                [
                    _namespace_query(
                        source="loki",
                        name="sandbox_namespace_errors",
                        description="Error/fatal logs in the sandbox demo namespace.",
                        query=('{k8s_namespace_name="sandbox"} |~ "ERROR|FATAL|panic"'),
                        namespace="sandbox",
                        matcher='k8s_namespace_name="sandbox"',
                        cluster_id=cluster_id,
                        evidence_profile=evidence_profile,
                    ),
                    _namespace_query(
                        source="loki",
                        name="color_turf_runtime_failures",
                        description="Runtime failures in the color-turf demo namespace.",
                        query=(
                            '{k8s_namespace_name="color-turf"} '
                            '|~ "OOM|out of memory|chaos.oom|ERROR|FATAL|panic"'
                        ),
                        namespace="color-turf",
                        matcher='k8s_namespace_name="color-turf"',
                        cluster_id=cluster_id,
                        evidence_profile=evidence_profile,
                    ),
                ]
            )
        return queries

    if provider_key == "traces":
        # Current OTEL resources expose service.name only. Until a verified
        # cluster attribute exists, emitting a shared-backend TraceQL query is unsafe.
        return []
    if provider_key == "metadata":
        return [
            _query(
                source="metadata",
                name="change_context",
                description="Change context metadata for RCA.",
                query="change_context",
                provenance=_provenance(
                    cluster_id=cluster_id,
                    evidence_profile=evidence_profile,
                    query_scope="cluster",
                ),
            )
        ]
    return []


def profile_default_query_names() -> frozenset[str]:
    """Return every reserved server preset name across target profiles."""

    names: set[str] = set()
    for profile in (STANDARD_EVIDENCE_PROFILE, DEMO_EVIDENCE_PROFILE):
        for provider_key in EVIDENCE_PROVIDER_KEYS:
            names.update(
                str(query["name"])
                for query in evidence_provider_queries(
                    provider_key,
                    cluster_id=Target.DEFAULT_CLUSTER_ID,
                    evidence_profile=profile,
                )
            )
    return frozenset(names)


def evidence_profile_for_registration(
    *,
    cluster_role: str,
    environment: str,
    install_sample_workload: bool,
) -> EvidenceProfile:
    if cluster_role == MANAGEMENT_CLUSTER_ROLE:
        return MANAGEMENT_EVIDENCE_PROFILE
    if install_sample_workload or environment.strip().casefold() in RCA_TEST_TARGET_ENVIRONMENTS:
        return DEMO_EVIDENCE_PROFILE
    return STANDARD_EVIDENCE_PROFILE


def default_evidence_provider_policy(
    provider_key: str,
    interval_seconds: int,
    *,
    cluster_id: str = Target.DEFAULT_CLUSTER_ID,
    evidence_profile: EvidenceProfile = STANDARD_EVIDENCE_PROFILE,
    enabled: bool | None = None,
    queries: list[dict[str, object]] | None = None,
) -> EvidenceProviderPolicy:
    """Build the default policy for one evidence provider."""
    compiled_queries = (
        evidence_provider_queries(
            provider_key,
            cluster_id=cluster_id,
            evidence_profile=evidence_profile,
        )
        if queries is None
        else list(queries)
    )
    return EvidenceProviderPolicy(
        enabled=bool(compiled_queries) if enabled is None else enabled,
        interval_seconds=interval_seconds,
        min_workers=DEFAULT_EVIDENCE_PROVIDER_WORKERS,
        max_workers=DEFAULT_EVIDENCE_PROVIDER_MAX_WORKERS,
        queries=compiled_queries,
    )


def default_evidence_providers(
    interval_seconds: int,
    *,
    cluster_id: str = Target.DEFAULT_CLUSTER_ID,
    cluster_role: str = DEFAULT_CLUSTER_ROLE,
    evidence_profile: EvidenceProfile | None = None,
) -> dict[str, EvidenceProviderPolicy]:
    """Build default provider policies for all known providers."""
    resolved_profile = evidence_profile or (
        MANAGEMENT_EVIDENCE_PROFILE
        if cluster_role == MANAGEMENT_CLUSTER_ROLE
        else STANDARD_EVIDENCE_PROFILE
    )
    if cluster_role == MANAGEMENT_CLUSTER_ROLE and resolved_profile != MANAGEMENT_EVIDENCE_PROFILE:
        raise ValueError("management clusters require the management evidence profile")
    if cluster_role != MANAGEMENT_CLUSTER_ROLE and resolved_profile == MANAGEMENT_EVIDENCE_PROFILE:
        raise ValueError("target clusters cannot use the management evidence profile")
    return {
        provider_key: default_evidence_provider_policy(
            provider_key,
            interval_seconds,
            cluster_id=cluster_id,
            evidence_profile=resolved_profile,
        )
        for provider_key in EVIDENCE_PROVIDER_KEYS
    }


def default_agent_policy(
    *,
    cluster_id: str,
    cluster_role: str = DEFAULT_CLUSTER_ROLE,
    interval_seconds: int = int(Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS),
    failure_policy: str = DEFAULT_EVIDENCE_FAILURE_POLICY,
    bootstrap_mode: str = DEFAULT_BOOTSTRAP_MODE,
    generation: int = 1,
    evidence_profile: EvidenceProfile | None = None,
) -> AgentPolicy:
    """Build the default policy used by a target cluster agent."""
    resolved_profile = evidence_profile or (
        MANAGEMENT_EVIDENCE_PROFILE
        if cluster_role == MANAGEMENT_CLUSTER_ROLE
        else STANDARD_EVIDENCE_PROFILE
    )
    return AgentPolicy(
        cluster_id=cluster_id,
        cluster_role=cluster_role,
        generation=generation,
        evidence=EvidenceRuntimePolicy(
            profile=resolved_profile,
            failure_policy=failure_policy,
            providers=default_evidence_providers(
                interval_seconds,
                cluster_id=cluster_id,
                cluster_role=cluster_role,
                evidence_profile=resolved_profile,
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
