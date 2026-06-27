from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PrometheusInstantQuery:
    metric_name: str
    description: str
    promql: str


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
        metric_name="node_collector_cpu_usage_ratio",
        description="Demo node runtime CPU ratio exposed by optional-node-collector.",
        promql="node_collector_cpu_usage_ratio",
    ),
)
