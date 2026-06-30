from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PrometheusInstantQuery:
    metric_name: str
    description: str
    promql: str


@dataclass(frozen=True)
class LokiLogQuery:
    query_name: str
    description: str
    logql: str


@dataclass(frozen=True)
class OpenTelemetrySpanQuery:
    query_name: str
    description: str
    traceql: str


# Connection-check queries that are expected to exist in the local target cluster.
PROMETHEUS_INSTANT_QUERIES: tuple[PrometheusInstantQuery, ...] = (
    PrometheusInstantQuery(
        metric_name="scrape_targets_up",
        description="Prometheus scrape target health for the target cluster.",
        promql="up",
    ),
    PrometheusInstantQuery(
        metric_name="target_pod_info",
        description="Pods discovered by kube-state-metrics in the target namespace.",
        promql='kube_pod_info{namespace="target"}',
    ),
    PrometheusInstantQuery(
        metric_name="target_deployment_replicas",
        description="Deployment replica counts reported by kube-state-metrics.",
        promql='kube_deployment_status_replicas{namespace="target"}',
    ),
    PrometheusInstantQuery(
        metric_name="node_cpu_usage_ratio",
        description="Node CPU usage ratio from Prometheus node-exporter metrics.",
        promql='1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))',
    ),
    PrometheusInstantQuery(
        metric_name="node_memory_usage_ratio",
        description="Node memory usage ratio from Prometheus node-exporter metrics.",
        promql="1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
    ),
    PrometheusInstantQuery(
        metric_name="node_filesystem_usage_ratio",
        description="Node filesystem usage ratio from Prometheus node-exporter metrics.",
        promql=(
            '1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"} '
            '/ node_filesystem_size_bytes{fstype!~"tmpfs|overlay",mountpoint="/var"})'
        ),
    ),
    PrometheusInstantQuery(
        metric_name="node_collector_node_pod_count",
        description="Pods scheduled on each Kubernetes node reported by optional-node-collector.",
        promql="node_collector_node_pod_count",
    ),
    PrometheusInstantQuery(
        metric_name="node_collector_node_not_ready_pod_count",
        description="Not Ready Pods on each Kubernetes node reported by optional-node-collector.",
        promql="node_collector_node_not_ready_pod_count",
    ),
    PrometheusInstantQuery(
        metric_name="node_collector_scrape_error",
        description="Whether optional-node-collector failed to read Kubernetes API data.",
        promql="node_collector_scrape_error",
    ),
)


# Dummy LogQL queries for the future Loki adapter.
LOKI_LOG_QUERIES: tuple[LokiLogQuery, ...] = (
    LokiLogQuery(
        query_name="target_namespace_errors",
        description="Error logs emitted by workloads in the target namespace.",
        logql='{namespace="target"} |= "ERROR"',
    ),
    LokiLogQuery(
        query_name="node_collector_runtime_samples",
        description="Structured runtime samples emitted by optional-node-collector.",
        logql='{namespace="target", app="optional-node-collector"} |= "node_runtime_sample"',
    ),
    LokiLogQuery(
        query_name="target_agent_warnings",
        description="Warnings or failures emitted by the target-cluster-agent.",
        logql='{namespace="target", app="target-cluster-agent"} |~ "WARN|ERROR|failed"',
    ),
)


# Tempo stores traces from OpenTelemetry Collector and supports TraceQL search.
OPEN_TELEMETRY_SPAN_QUERIES: tuple[OpenTelemetrySpanQuery, ...] = (
    OpenTelemetrySpanQuery(
        query_name="checkout_slow_spans",
        description="Slow checkout spans for demo RCA evidence.",
        traceql='{ resource.service.name = "checkout-api" }',
    ),
    OpenTelemetrySpanQuery(
        query_name="target_agent_error_spans",
        description="Error spans emitted by the target-cluster-agent.",
        traceql='{ resource.service.name = "target-cluster-agent" && status = error }',
    ),
    OpenTelemetrySpanQuery(
        query_name="management_gateway_spans",
        description="Management Gateway request spans related to agent traffic.",
        traceql='{ resource.service.name = "api-gateway" }',
    ),
)
