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
    assert validated.logs[0]["pattern_counts"]["probe_failed"] == 0
    assert validated.logs[0]["severity_counts"]["unknown"] == 1
    assert validated.logs[0]["trace_ids"] == []
    assert validated.logs[0]["redaction_summary"] == {
        "applied": True,
        "redacted_line_count": 0,
    }


def test_loki_logs_redact_sensitive_values_and_add_rca_summaries() -> None:
    module = load_evidence_module()
    logs_provider = module.LokiLogsProvider.from_config(lambda _name, default: default)
    trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"

    normalized = logs_provider.normalize_payload(
        {
            "data": {
                "resultType": "streams",
                "result": [
                    {
                        "stream": {"namespace": "target", "pod": "checkout-api-7f5c"},
                        "values": [
                            [
                                "1782822589742000000",
                                f"ERROR readiness probe failed token=secret-value trace_id={trace_id}",
                            ],
                            [
                                "1782822589743000000",
                                "WARN upstream dependency timed out Authorization: Bearer raw-token",
                            ],
                            [
                                "1782822589744000000",
                                "ErrImagePull secret=registry-token",
                            ],
                            [
                                "1782822589745000000",
                                'INFO login password="hello world"',
                            ],
                        ],
                    }
                ],
            },
        }
    )

    lines = [
        value["line"]
        for stream in normalized["streams"]
        for value in stream["values"]
    ]

    assert lines == [
        f"ERROR readiness probe failed token=[REDACTED] trace_id={trace_id}",
        "WARN upstream dependency timed out Authorization: Bearer [REDACTED]",
        "ErrImagePull secret=[REDACTED]",
        "INFO login password=[REDACTED]",
    ]
    assert normalized["line_count"] == 4
    assert normalized["pattern_counts"]["probe_failed"] == 1
    assert normalized["pattern_counts"]["dependency_timeout"] == 1
    assert normalized["pattern_counts"]["image_pull_error"] == 1
    assert normalized["severity_counts"]["error"] == 1
    assert normalized["severity_counts"]["warn"] == 1
    assert normalized["severity_counts"]["info"] == 1
    assert normalized["severity_counts"]["unknown"] == 1
    assert normalized["trace_ids"] == [trace_id]
    assert normalized["redaction_summary"] == {
        "applied": True,
        "redacted_line_count": 4,
    }


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
                    "status": "error",
                    "durationMs": 842,
                    "query": span_query.traceql,
                    "spanSet": {
                        "spans": [
                            {
                                "traceID": "trace-123",
                                "spanID": "span-abc",
                                "serviceName": "payment-api",
                                "name": "POST /charge",
                                "status": "STATUS_CODE_ERROR",
                                "durationMs": 321,
                                "kind": "SPAN_KIND_CLIENT",
                            }
                        ]
                    },
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
    assert results["checkout_slow_spans"]["analysis"]["trace_ids"] == ["trace-123"]
    assert results["checkout_slow_spans"]["analysis"]["services"] == ["checkout-api"]
    assert results["checkout_slow_spans"]["analysis"]["operations"] == ["GET /checkout"]
    assert results["checkout_slow_spans"]["analysis"]["status_counts"]["error"] == 1
    assert results["checkout_slow_spans"]["analysis"]["error_count"] == 1
    assert results["checkout_slow_spans"]["analysis"]["dependency_count"] == 1
    assert results["checkout_slow_spans"]["analysis"]["duration_ms"]["max"] == 842.0
    trace_summary = results["checkout_slow_spans"]["analysis"]["trace_summaries"][0]
    assert trace_summary["trace_id"] == "trace-123"
    assert trace_summary["service"] == "checkout-api"
    assert trace_summary["operation"] == "GET /checkout"
    assert trace_summary["status"] == "error"
    assert trace_summary["error"] is True
    assert trace_summary["is_dependency"] is True
    assert trace_summary["span_summaries"][0] == {
        "trace_id": "trace-123",
        "span_id": "span-abc",
        "service": "payment-api",
        "operation": "POST /charge",
        "status": "error",
        "duration_ms": 321.0,
        "error": True,
        "is_dependency": True,
    }
