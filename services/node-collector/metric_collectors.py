from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from kubernetes_api import KubernetesApiClient, count_not_ready_pods, pods_on_node
from prometheus_metrics import MetricSample


class MetricCollector(Protocol):
    # This is not a real collector object. It is a type contract.
    # A concrete class like PodMetricCollector matches this contract
    # when it defines this same async collect(labels) method.
    async def collect(self, labels: dict[str, str]) -> list[MetricSample]: ...


@dataclass(frozen=True)
class PodSummary:
    # Kubernetes Pod data reduced to the node-scoped values this collector owns.
    pod_count: int
    not_ready_pod_count: int


def collector_status_metric_sample(labels: dict[str, str], has_error: bool) -> MetricSample:
    # Always emit collector health so Prometheus can see partial collection failures.
    return MetricSample(
        name="node_collector_scrape_error",
        help="Whether node collector failed to read Kubernetes API data.",
        value=1 if has_error else 0,
        labels=labels,
    )


class PodMetricCollector:
    # Owns Pod-related Kubernetes API reads and converts them directly to MetricSample values.
    def __init__(self, kubernetes: KubernetesApiClient, node_name: str) -> None:
        self.kubernetes = kubernetes
        self.node_name = node_name

    async def collect_pod_summary(self) -> PodSummary:
        # Fetch all Pods, then reduce them to values for this collector's node.
        pods_payload = await self.kubernetes.list_pods()
        node_pods = pods_on_node(pods_payload, self.node_name)
        return PodSummary(
            pod_count=len(node_pods),
            not_ready_pod_count=count_not_ready_pods(node_pods),
        )

    async def collect(self, labels: dict[str, str]) -> list[MetricSample]:
        summary = await self.collect_pod_summary()
        return [
            MetricSample(
                name="node_collector_node_pod_count",
                help="Pods scheduled on this Kubernetes node.",
                value=summary.pod_count,
                labels=labels,
            ),
            MetricSample(
                name="node_collector_node_not_ready_pod_count",
                help="Pods scheduled on this Kubernetes node that are not Ready.",
                value=summary.not_ready_pod_count,
                labels=labels,
            ),
        ]
