from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

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


# ── Loki 로그 증거 ──────────────────────────────────────────


def test_loki_logs_are_normalized_into_agent_evidence_shape() -> None:
    module = load_evidence_module()
    logs_provider = module.LokiLogsProvider.from_config(lambda _name, default: default)
    collector = module.EvidenceCollector([logs_provider])
    for index in range(3):
        collector.register_query(
            module.TelemetryQueryDefinition.from_mapping(
                {
                    "source": "loki",
                    "name": f"target_log_query_{index}",
                    "description": "Target log query.",
                    "query": '{k8s_namespace_name="target"}',
                }
            )
        )

    async def stub_query_loki(_client, log_query) -> dict[str, object]:
        return {
            "status": "success",
            "data": {
                "resultType": "streams",
                "result": [
                    {
                        "stream": {
                            "namespace": "target",
                            "app": "optional-node-collector",
                            "query": log_query.logql,
                        },
                        "values": [["1782822589742000000", "node_runtime_sample"]],
                    }
                ],
            },
        }

    collector.providers["logs"].query = stub_query_loki

    logs = asyncio.run(collector.collect("logs"))["logs"]
    payload = {
        "cluster_id": "target-cluster-01",
        "kubernetes": {},
        "logs": logs,
    }

    validated = AgentEvidenceRequest.model_validate(payload)

    assert len(validated.logs) == 3
    assert validated.logs[0]["source"] == "loki"
    assert validated.logs[0]["line_count"] == 1
    assert validated.logs[0]["streams"][0]["stream"]["namespace"] == "target"
    assert validated.logs[0]["streams"][0]["values"][0]["line"] == "node_runtime_sample"


# ── Tempo 트레이스 증거 ─────────────────────────────────────


def test_tempo_traces_are_normalized_into_agent_evidence_shape() -> None:
    module = load_evidence_module()
    traces_provider = module.TempoTracesProvider.from_config(lambda _name, default: default)
    collector = module.EvidenceCollector([traces_provider])
    collector.register_query(
        module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "tempo",
                "name": "checkout_slow_spans",
                "description": "Slow checkout spans.",
                "query": '{ resource.service.name = "checkout-api" }',
            }
        )
    )

    async def stub_query_tempo(_client, span_query) -> dict[str, object]:
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

    collector.providers["traces"].query = stub_query_tempo

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
