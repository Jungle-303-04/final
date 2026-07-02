from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

from packages.contracts.gateway.requests import AgentEvidenceRequest

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_DIR = ROOT_DIR / "services" / "target-cluster-agent"


def load_evidence_module():
    module_names = (
        "settings",
        "telemetry_queries",
        "span",
        "span.base",
        "span.otel",
        "providers",
        "providers.base",
        "providers.loki_providers",
        "providers.prometheus_providers",
        "providers.tempo_providers",
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


def test_tempo_traces_are_normalized_into_agent_evidence_shape() -> None:
    module = load_evidence_module()
    traces_provider = module.TempoTracesProvider.from_config(lambda _name, default: default)
    collector = module.EvidenceCollector([traces_provider])

    async def fake_query_tempo(_client, span_query) -> dict[str, object]:
        return {
            "traces": [
                {
                    "traceID": "trace-123",
                    "rootServiceName": "checkout-api",
                    "rootTraceName": "GET /checkout",
                    "durationMs": 842,
                    "query": span_query.traceql,
                }
            ]
        }

    collector.providers["traces"].query = fake_query_tempo

    traces = asyncio.run(collector.collect("traces"))["traces"]
    payload = {
        "cluster_id": "target-cluster-01",
        "kubernetes": {},
        "traces": traces,
    }

    validated = AgentEvidenceRequest.model_validate(payload)
    results = validated.traces["results"]

    assert validated.traces["source"] == "tempo"
    assert "checkout_slow_spans" in results
    assert results["checkout_slow_spans"]["trace_count"] == 1
    assert results["checkout_slow_spans"]["traces"][0]["traceID"] == "trace-123"
