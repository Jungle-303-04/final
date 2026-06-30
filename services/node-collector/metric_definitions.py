from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class FieldMetricDefinition:
    # This is metadata, not a collected value.
    # sample_field tells node_collector which NodeRuntimeSample attribute becomes the value.
    name: str
    help: str
    sample_field: str
    type: Literal["gauge", "counter"] = "gauge"


# Collector health/status metrics are always emitted so Prometheus can see collector failures.
COLLECTOR_STATUS_METRIC_DEFINITIONS = (
    FieldMetricDefinition(
        name="node_collector_scrape_error",
        help="Whether node collector failed to read Kubernetes API data.",
        sample_field="scrape_error",
    ),
)

# Pod metrics are simple field-based metrics. The Kubernetes API parsing happens in
# NodeCollector.collect_pod_summary(); this file only names the Prometheus metrics.
POD_METRIC_DEFINITIONS = (
    FieldMetricDefinition(
        name="node_collector_node_pod_count",
        help="Pods scheduled on this Kubernetes node.",
        sample_field="node_pod_count",
    ),
    FieldMetricDefinition(
        name="node_collector_node_not_ready_pod_count",
        help="Pods scheduled on this Kubernetes node that are not Ready.",
        sample_field="node_not_ready_pod_count",
    ),
)
