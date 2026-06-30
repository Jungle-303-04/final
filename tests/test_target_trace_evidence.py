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
        "test_target_trace_evidence_module",
        TARGET_AGENT_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {TARGET_AGENT_PATH}")

    module = importlib.util.module_from_spec(spec)
    previous_modules = {
        name: sys.modules.pop(name, None) for name in ("settings", "telemetry_queries")
    }
    sys.path.insert(0, str(TARGET_AGENT_PATH.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(TARGET_AGENT_PATH.parent))
        for name in ("settings", "telemetry_queries"):
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


def fake_evidence() -> dict[str, object]:
    return {
        "cluster_id": "target-cluster-01",
        "kubernetes": {},
        "metrics": {},
        "logs": [],
        "traces": {},
    }


def test_tempo_traces_are_normalized_into_agent_evidence_shape() -> None:
    module = load_evidence_module()
    collector = module.EvidenceCollector(
        "http://prometheus.target.svc:9090",
        "http://loki-gateway.target.svc",
        "http://tempo.target.svc:3200",
        fake_evidence,
    )

    async def fake_query_tempo(_client, traceql: str) -> dict[str, object]:
        return {
            "traces": [
                {
                    "traceID": "trace-123",
                    "rootServiceName": "checkout-api",
                    "rootTraceName": "GET /checkout",
                    "durationMs": 842,
                    "query": traceql,
                }
            ]
        }

    collector.query_tempo = fake_query_tempo

    traces = asyncio.run(collector.collect_tempo_traces())
    payload = fake_evidence()
    payload["traces"] = traces

    validated = AgentEvidenceRequest.model_validate(payload)
    results = validated.traces["results"]

    assert validated.traces["source"] == "tempo"
    assert "checkout_slow_spans" in results
    assert results["checkout_slow_spans"]["trace_count"] == 1
    assert results["checkout_slow_spans"]["traces"][0]["traceID"] == "trace-123"
