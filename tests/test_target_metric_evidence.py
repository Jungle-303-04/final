from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path

from packages.contracts.gateway.requests import AgentEvidenceRequest

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_PATH = ROOT_DIR / "services" / "target-cluster-agent" / "evidence.py"


def load_evidence_module():
    spec = importlib.util.spec_from_file_location(
        "test_target_metric_evidence_module",
        TARGET_AGENT_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {TARGET_AGENT_PATH}")

    module = importlib.util.module_from_spec(spec)
    module_names = (
        "settings",
        "telemetry_queries",
        "providers",
        "providers.base",
        "providers.loki_providers",
        "providers.prometheus_providers",
        "providers.tempo_providers",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(TARGET_AGENT_PATH.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(TARGET_AGENT_PATH.parent))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


def test_prometheus_metrics_are_normalized_into_agent_evidence_shape() -> None:
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
                        "metric": {
                            "query": metric_query.promql,
                            "node": "target-control-plane",
                        },
                        "value": [1782822589.742, "26"],
                    }
                ],
            },
        }

    collector.telemetry_providers["metrics"].query = fake_query_prometheus

    metrics = asyncio.run(collector.collect_prometheus_metrics())
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
