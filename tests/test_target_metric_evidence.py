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
        "providers.kubernetes_providers",
        "providers.loki_providers",
        "providers.prometheus_providers",
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

    async def fake_query_prometheus(_client, metric_query) -> dict[str, object]:
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

    collector.providers["metrics"].query = fake_query_prometheus

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
    assert (
        results["node_collector_node_pod_count"]["samples"][0]["metric"]["node"]
        == "target-control-plane"
    )


def test_collector_runs_one_off_query_definition() -> None:
    module = load_evidence_module()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    collector = module.EvidenceCollector([metrics_provider])

    async def fake_query_prometheus(_client, metric_query) -> dict[str, object]:
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

    collector.providers["metrics"].query = fake_query_prometheus
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


def test_prometheus_range_query_is_normalized_into_series() -> None:
    module = load_evidence_module()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    collector = module.EvidenceCollector([metrics_provider])

    async def fake_query_prometheus(_client, metric_query) -> dict[str, object]:
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

    collector.providers["metrics"].query = fake_query_prometheus
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


def test_collector_rejects_unknown_provider_keys() -> None:
    module = load_evidence_module()
    collector = module.EvidenceCollector([])

    with pytest.raises(ValueError, match="unknown evidence provider key"):
        asyncio.run(collector.collect("metrics"))
