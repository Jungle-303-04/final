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
        "test_target_log_evidence_module",
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


def test_loki_logs_are_normalized_into_agent_evidence_shape() -> None:
    module = load_evidence_module()
    collector = module.EvidenceCollector(
        "http://prometheus.target.svc:9090",
        "http://loki-gateway.target.svc",
        fake_evidence,
    )

    async def fake_query_loki(_client, query: str) -> dict[str, object]:
        return {
            "status": "success",
            "data": {
                "resultType": "streams",
                "result": [
                    {
                        "stream": {
                            "namespace": "target",
                            "app": "optional-node-collector",
                            "query": query,
                        },
                        "values": [["1782822589742000000", "node_runtime_sample"]],
                    }
                ],
            },
        }

    collector.query_loki = fake_query_loki

    logs = asyncio.run(collector.collect_loki_logs())
    payload = fake_evidence()
    payload["logs"] = logs

    validated = AgentEvidenceRequest.model_validate(payload)

    assert len(validated.logs) == 3
    assert validated.logs[0]["source"] == "loki"
    assert validated.logs[0]["line_count"] == 1
    assert validated.logs[0]["streams"][0]["stream"]["namespace"] == "target"
    assert validated.logs[0]["streams"][0]["values"][0]["line"] == "node_runtime_sample"
