from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

import pytest

from packages.contracts.gateway.requests import AgentEvidenceRequest

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_DIR = ROOT_DIR / "src" / "services" / "target" / "cluster-agent"


def load_evidence_module():
    module_names = (
        "config",
        "queries",
        "queries.registry",
        "span",
        "span.base",
        "span.otel",
        "providers",
        "providers.base",
        "providers.kubernetes_utils",
        "providers.kubernetes_providers",
        "providers.loki_providers",
        "providers.metadata_config_objects",
        "providers.metadata_config_refs",
        "providers.metadata_endpoint_slices",
        "providers.metadata_ownership",
        "providers.metadata_resource_quotas",
        "providers.metadata_providers",
        "providers.metadata_service_selectors",
        "providers.metadata_workload_snapshots",
        "providers.prometheus_analysis",
        "providers.prometheus_providers",
        "providers.tempo_analysis",
        "providers.tempo_providers",
        "kubernetes_api",
        "evidence",
        "evidence.collector",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(TARGET_AGENT_DIR))
    try:
        return importlib.import_module("evidence")
    finally:
        sys.path.remove(str(TARGET_AGENT_DIR))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


def test_prometheus_metrics_are_normalized_into_agent_evidence_shape() -> None:
    module = load_evidence_module()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    collector = module.EvidenceCollector([metrics_provider])
    collector.register_query(
        module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "prometheus",
                "name": "node_collector_node_pod_count",
                "description": "Pods scheduled on each Kubernetes node.",
                "query": "node_collector_node_pod_count",
            }
        )
    )

    async def stub_query_prometheus(_client, metric_query) -> dict[str, object]:
        return {
            "status": "success",
            "data": {
                "resultType": "vector",
                "result": [
                    {
                        "metric": {
                            "query": metric_query.promql,
                            "node": "target-control-plane",
                        },
                        "value": [1782822589.742, "26"],
                    }
                ],
            },
        }

    collector.providers["metrics"].query = stub_query_prometheus

    metrics = asyncio.run(collector.collect("metrics"))["metrics"]
    payload = {
        "cluster_id": "target-cluster-01",
        "kubernetes": {},
        "metrics": metrics,
    }

    validated = AgentEvidenceRequest.model_validate(payload)
    results = validated.metrics["results"]

    assert validated.metrics["source"] == "prometheus"
    assert "node_collector_node_pod_count" in results
    assert results["node_collector_node_pod_count"]["samples"][0]["value"] == 26.0
    assert results["node_collector_node_pod_count"]["analysis"]["metric_kind"] == "pod_count"
    assert results["node_collector_node_pod_count"]["analysis"]["value_summary"]["latest"] == 26.0
    assert (
        results["node_collector_node_pod_count"]["samples"][0]["metric"]["node"]
        == "target-control-plane"
    )


def test_collector_runs_one_off_query_definition() -> None:
    module = load_evidence_module()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    collector = module.EvidenceCollector([metrics_provider])

    async def stub_query_prometheus(_client, metric_query) -> dict[str, object]:
        return {
            "status": "success",
            "data": {
                "resultType": "vector",
                "result": [
                    {
                        "metric": {"query": metric_query.promql},
                        "value": [1782822589.742, "1"],
                    }
                ],
            },
        }

    collector.providers["metrics"].query = stub_query_prometheus
    definition = module.TelemetryQueryDefinition.from_mapping(
        {
            "source": "prometheus",
            "name": "one_off_up",
            "description": "One-off scrape check.",
            "query": "up",
        }
    )

    result = asyncio.run(collector.run_query(definition))

    assert result["source"] == "prometheus"
    assert result["results"]["one_off_up"]["samples"][0]["value"] == 1.0
    assert result["results"]["one_off_up"]["analysis"]["metric_kind"] == "scrape_health"
    assert result["results"]["one_off_up"]["analysis"]["threshold"] == {
        "comparator": "less_than",
        "critical": 1.0,
        "observed_value": 1.0,
        "level": "none",
        "exceeded": False,
    }


def test_prometheus_ratio_metrics_add_threshold_analysis() -> None:
    module = load_evidence_module()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)

    result: dict[str, object] = {}
    definition = module.TelemetryQueryDefinition.from_mapping(
        {
            "source": "prometheus",
            "name": "node_memory_usage_ratio",
            "description": "Node memory usage ratio.",
            "query": "1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
        }
    )
    metrics_provider.append_result(
        result,
        definition.to_provider_query(),
        {
            "status": "success",
            "data": {
                "resultType": "vector",
                "result": [
                    {
                        "metric": {"instance": "node-a"},
                        "value": [1782822589.742, "0.91"],
                    },
                    {
                        "metric": {"instance": "node-b"},
                        "value": [1782822590.742, "0.73"],
                    },
                ],
            },
        },
    )

    analysis = result["node_memory_usage_ratio"]["analysis"]

    assert analysis["metric_kind"] == "memory_usage_ratio"
    assert analysis["unit"] == "ratio"
    assert analysis["value_summary"]["max"] == 0.91
    assert analysis["value_summary"]["latest"] == 0.73
    assert analysis["threshold"] == {
        "comparator": "greater_than_or_equal",
        "warning": 0.8,
        "critical": 0.9,
        "observed_value": 0.91,
        "level": "critical",
        "exceeded": True,
    }
    assert analysis["signals"] == ["memory_pressure"]


def test_prometheus_range_metrics_add_baseline_comparison() -> None:
    module = load_evidence_module()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)

    result: dict[str, object] = {}
    definition = module.TelemetryQueryDefinition.from_mapping(
        {
            "source": "prometheus",
            "name": "node_collector_node_not_ready_pod_count",
            "description": "Not Ready pod count trend.",
            "query": "node_collector_node_not_ready_pod_count",
            "range_seconds": 900,
            "step_seconds": 30,
        }
    )
    metrics_provider.append_result(
        result,
        definition.to_provider_query(),
        {
            "status": "success",
            "data": {
                "resultType": "matrix",
                "result": [
                    {
                        "metric": {"node": "node-a"},
                        "values": [[1782822500.0, "0"], [1782822530.0, "2"]],
                    },
                    {
                        "metric": {"node": "node-b"},
                        "values": [[1782822500.0, "1"], [1782822530.0, "1"]],
                    },
                ],
            },
        },
    )

    analysis = result["node_collector_node_not_ready_pod_count"]["analysis"]

    assert analysis["metric_kind"] == "pod_not_ready_count"
    assert analysis["point_count"] == 4
    assert analysis["threshold"]["exceeded"] is True
    assert analysis["baseline_comparison"] == {
        "basis": "first_point_in_range",
        "series_count": 2,
        "increased_series_count": 1,
        "decreased_series_count": 0,
        "flat_series_count": 1,
        "max_delta": 2.0,
        "max_percent_change": 0.0,
    }
    assert analysis["signals"] == ["increased_from_range_start", "not_ready_pods"]


def test_prometheus_cpu_throttling_metrics_add_positive_signal() -> None:
    module = load_evidence_module()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)

    result: dict[str, object] = {}
    definition = module.TelemetryQueryDefinition.from_mapping(
        {
            "source": "prometheus",
            "name": "container_cpu_throttling",
            "description": "Container CPU throttling.",
            "query": "sum(rate(container_cpu_cfs_throttled_periods_total[5m]))",
        }
    )
    metrics_provider.append_result(
        result,
        definition.to_provider_query(),
        {
            "status": "success",
            "data": {
                "resultType": "vector",
                "result": [
                    {
                        "metric": {"namespace": "target", "pod": "checkout-api-1"},
                        "value": [1782822590.742, "4"],
                    }
                ],
            },
        },
    )

    analysis = result["container_cpu_throttling"]["analysis"]

    assert analysis["metric_kind"] == "cpu_throttling"
    assert analysis["threshold"] == {
        "comparator": "greater_than",
        "warning": 0.0,
        "observed_value": 4.0,
        "level": "warning",
        "exceeded": True,
    }
    assert analysis["signals"] == ["cpu_throttling"]


def test_prometheus_range_query_is_normalized_into_series() -> None:
    module = load_evidence_module()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    collector = module.EvidenceCollector([metrics_provider])

    async def stub_query_prometheus(_client, metric_query) -> dict[str, object]:
        assert type(metric_query).__name__ == "PrometheusRangeQuery"
        assert metric_query.range_seconds == 900
        assert metric_query.step_seconds == 30
        return {
            "status": "success",
            "data": {
                "resultType": "matrix",
                "result": [
                    {
                        "metric": {"pod": "checkout-api-1"},
                        "values": [[1782822500.0, "1"], [1782822530.0, "3"]],
                    }
                ],
            },
        }

    collector.providers["metrics"].query = stub_query_prometheus
    definition = module.TelemetryQueryDefinition.from_mapping(
        {
            "source": "prometheus",
            "name": "restart_rate",
            "description": "Restart trend.",
            "query": "increase(kube_pod_container_status_restarts_total[15m])",
            "range_seconds": 900,
            "step_seconds": 30,
        }
    )

    result = asyncio.run(collector.run_query(definition))
    restart_rate = result["results"]["restart_rate"]

    assert restart_rate["query_mode"] == "range"
    assert restart_rate["result_type"] == "matrix"
    assert restart_rate["point_count"] == 2
    assert restart_rate["series"][0]["values"][1]["value"] == 3.0
    assert restart_rate["analysis"]["metric_kind"] == "restart_count_or_rate"
    assert restart_rate["analysis"]["baseline_comparison"]["increased_series_count"] == 1


def test_collector_rejects_unknown_provider_keys() -> None:
    module = load_evidence_module()
    collector = module.EvidenceCollector([])

    with pytest.raises(ValueError, match="unknown evidence provider key"):
        asyncio.run(collector.collect("metrics"))
