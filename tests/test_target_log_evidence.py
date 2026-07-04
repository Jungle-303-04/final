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

    async def fake_query_loki(_client, log_query) -> dict[str, object]:
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

    collector.providers["logs"].query = fake_query_loki

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
