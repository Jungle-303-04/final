from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Self, cast

TelemetrySource = Literal["prometheus", "loki", "tempo"]

SOURCE_EVIDENCE_KEYS: dict[TelemetrySource, str] = {
    "prometheus": "metrics",
    "loki": "logs",
    "tempo": "traces",
}

SUPPORTED_QUERY_FILE_SUFFIXES = {".json"}


@dataclass(frozen=True)
class TelemetryQueryDefinition:
    source: TelemetrySource
    name: str
    description: str
    query: str

    @classmethod
    def from_mapping(cls, payload: dict[str, Any]) -> Self:
        source = _required_text(payload, "source")
        if source not in SOURCE_EVIDENCE_KEYS:
            supported = ", ".join(SOURCE_EVIDENCE_KEYS)
            raise ValueError(
                f"unsupported telemetry query source: {source}; supported: {supported}"
            )

        return cls(
            source=cast(TelemetrySource, source),
            name=_required_text(payload, "name"),
            description=str(payload.get("description", "")),
            query=_required_text(payload, "query"),
        )

    def to_provider_query(
        self,
    ) -> PrometheusInstantQuery | LokiLogQuery | OpenTelemetrySpanQuery:
        if self.source == "prometheus":
            return PrometheusInstantQuery(self.name, self.description, self.query)
        if self.source == "loki":
            return LokiLogQuery(self.name, self.description, self.query)
        return OpenTelemetrySpanQuery(self.name, self.description, self.query)


class TelemetryQueryRegistry:
    def __init__(
        self,
        definitions: tuple[TelemetryQueryDefinition, ...] = (),
    ) -> None:
        self.definitions: dict[tuple[TelemetrySource, str], TelemetryQueryDefinition] = {}
        self.register_many(definitions)

    def register(self, definition: TelemetryQueryDefinition) -> TelemetryQueryDefinition:
        self.definitions[(definition.source, definition.name)] = definition
        return definition

    def register_many(
        self,
        definitions: tuple[TelemetryQueryDefinition, ...],
    ) -> tuple[TelemetryQueryDefinition, ...]:
        for definition in definitions:
            self.register(definition)
        return definitions

    def import_file(self, path: str | Path) -> tuple[TelemetryQueryDefinition, ...]:
        return self.register_many(load_query_definitions(path))

    def get(self, source: TelemetrySource, name: str) -> TelemetryQueryDefinition:
        try:
            return self.definitions[(source, name)]
        except KeyError as exc:
            raise ValueError(f"unknown telemetry query: {source}/{name}") from exc


def load_query_definitions(path: str | Path) -> tuple[TelemetryQueryDefinition, ...]:
    query_file = Path(path)
    if query_file.suffix not in SUPPORTED_QUERY_FILE_SUFFIXES:
        supported = ", ".join(sorted(SUPPORTED_QUERY_FILE_SUFFIXES))
        raise ValueError(f"unsupported telemetry query file: {query_file}; supported: {supported}")

    payload = json.loads(query_file.read_text(encoding="utf-8"))
    rows = payload.get("queries", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ValueError("telemetry query file must contain a list or a 'queries' list")

    return tuple(TelemetryQueryDefinition.from_mapping(row) for row in rows)


def _required_text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"telemetry query field must be a non-empty string: {key}")
    return value.strip()


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
        logql='{k8s_namespace_name="target"} |= "ERROR"',
    ),
    LokiLogQuery(
        query_name="node_collector_runtime_samples",
        description="Structured runtime samples emitted by optional-node-collector.",
        logql=(
            '{k8s_namespace_name="target", k8s_container_name="node-collector"} '
            '|= "node_runtime_sample"'
        ),
    ),
    LokiLogQuery(
        query_name="target_agent_warnings",
        description="Warnings or failures emitted by the target-cluster-agent.",
        logql=(
            '{k8s_namespace_name="target", k8s_container_name="target-cluster-agent"} '
            '|~ "WARN|ERROR|failed"'
        ),
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
        query_name="target_agent_recent_spans",
        description="Recent spans emitted by the target-cluster-agent evidence loop.",
        traceql='{ resource.service.name = "target-cluster-agent" }',
    ),
    OpenTelemetrySpanQuery(
        query_name="management_gateway_spans",
        description="Management Gateway request spans related to agent traffic.",
        traceql='{ resource.service.name = "api-gateway" }',
    ),
)

DEFAULT_TELEMETRY_QUERY_DEFINITIONS: tuple[TelemetryQueryDefinition, ...] = (
    *(
        TelemetryQueryDefinition("prometheus", query.metric_name, query.description, query.promql)
        for query in PROMETHEUS_INSTANT_QUERIES
    ),
    *(
        TelemetryQueryDefinition("loki", query.query_name, query.description, query.logql)
        for query in LOKI_LOG_QUERIES
    ),
    *(
        TelemetryQueryDefinition("tempo", query.query_name, query.description, query.traceql)
        for query in OPEN_TELEMETRY_SPAN_QUERIES
    ),
)
