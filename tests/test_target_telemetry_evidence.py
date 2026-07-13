from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path
from urllib.parse import parse_qs

import httpx

from packages.contracts.gateway.requests import AgentEvidenceRequest, EvidenceJobResultRequest

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
        "providers.collection_limits",
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
    assert validated.logs[0]["streams"][0]["line_count"] == 1
    assert validated.logs[0]["streams"][0]["pattern_counts"]["probe_failed"] == 0
    assert validated.logs[0]["streams"][0]["severity_counts"]["unknown"] == 1
    assert validated.logs[0]["streams"][0]["trace_ids"] == []
    assert validated.logs[0]["pattern_counts"]["probe_failed"] == 0
    assert validated.logs[0]["severity_counts"]["unknown"] == 1
    assert validated.logs[0]["trace_ids"] == []
    assert validated.logs[0]["matched_entries"] == []
    assert validated.logs[0]["collection_limit"]["matched_entries"] == {
        "max_items": 20,
        "original_count": 0,
        "returned_count": 0,
        "truncated": False,
    }
    assert validated.logs[0]["redaction_summary"] == {
        "applied": True,
        "redacted_line_count": 0,
        "truncated_line_count": 0,
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
                        "stream": {
                            "namespace": "target",
                            "pod": "checkout-api-7f5c",
                            "container": "app",
                        },
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
                            [
                                "1782822589746000000",
                                "ERROR server failed: address already in use",
                            ],
                            [
                                "1782822589747000000",
                                "FATAL permission denied opening /data",
                            ],
                            [
                                "1782822589748000000",
                                "ERROR missing required env DATABASE_URL",
                            ],
                        ],
                    }
                ],
            },
        }
    )

    lines = [value["line"] for stream in normalized["streams"] for value in stream["values"]]

    assert lines == [
        f"ERROR readiness probe failed token=[REDACTED] trace_id={trace_id}",
        "WARN upstream dependency timed out Authorization: Bearer [REDACTED]",
        "ErrImagePull secret=[REDACTED]",
        "INFO login password=[REDACTED]",
        "ERROR server failed: address already in use",
        "FATAL permission denied opening /data",
        "ERROR missing required env DATABASE_URL",
    ]
    assert normalized["line_count"] == 7
    stream_summary = normalized["streams"][0]
    assert stream_summary["line_count"] == 7
    assert stream_summary["pattern_counts"]["probe_failed"] == 1
    assert stream_summary["pattern_counts"]["missing_env"] == 1
    assert stream_summary["severity_counts"]["critical"] == 1
    assert stream_summary["severity_counts"]["error"] == 3
    assert stream_summary["trace_ids"] == [trace_id]
    assert normalized["pattern_counts"]["app_port_bind_failed"] == 1
    assert normalized["pattern_counts"]["permission_denied_startup"] == 1
    assert normalized["pattern_counts"]["missing_env"] == 1
    assert normalized["pattern_counts"]["probe_failed"] == 1
    assert normalized["pattern_counts"]["dependency_timeout"] == 1
    assert normalized["pattern_counts"]["image_pull_error"] == 1
    assert normalized["severity_counts"]["critical"] == 1
    assert normalized["severity_counts"]["error"] == 3
    assert normalized["severity_counts"]["warn"] == 1
    assert normalized["severity_counts"]["info"] == 1
    assert normalized["severity_counts"]["unknown"] == 1
    assert normalized["trace_ids"] == [trace_id]
    assert normalized["matched_entries"] == [
        {
            "timestamp": "1782822589742000000",
            "namespace": "target",
            "pod": "checkout-api-7f5c",
            "container": "app",
            "severity": "error",
            "message": f"ERROR readiness probe failed token=[REDACTED] trace_id={trace_id}",
            "matched_patterns": ["probe_failed"],
            "line_truncated": False,
            "trace_id": trace_id,
        },
        {
            "timestamp": "1782822589743000000",
            "namespace": "target",
            "pod": "checkout-api-7f5c",
            "container": "app",
            "severity": "warn",
            "message": "WARN upstream dependency timed out Authorization: Bearer [REDACTED]",
            "matched_patterns": ["dependency_timeout"],
            "line_truncated": False,
        },
        {
            "timestamp": "1782822589744000000",
            "namespace": "target",
            "pod": "checkout-api-7f5c",
            "container": "app",
            "severity": "unknown",
            "message": "ErrImagePull secret=[REDACTED]",
            "matched_patterns": ["image_pull_error"],
            "line_truncated": False,
        },
        {
            "timestamp": "1782822589746000000",
            "namespace": "target",
            "pod": "checkout-api-7f5c",
            "container": "app",
            "severity": "error",
            "message": "ERROR server failed: address already in use",
            "matched_patterns": ["app_port_bind_failed"],
            "line_truncated": False,
        },
        {
            "timestamp": "1782822589747000000",
            "namespace": "target",
            "pod": "checkout-api-7f5c",
            "container": "app",
            "severity": "critical",
            "message": "FATAL permission denied opening /data",
            "matched_patterns": ["permission_denied_startup"],
            "line_truncated": False,
        },
        {
            "timestamp": "1782822589748000000",
            "namespace": "target",
            "pod": "checkout-api-7f5c",
            "container": "app",
            "severity": "error",
            "message": "ERROR missing required env DATABASE_URL",
            "matched_patterns": ["missing_env"],
            "line_truncated": False,
        },
    ]
    assert normalized["collection_limit"]["matched_entries"] == {
        "max_items": 20,
        "original_count": 6,
        "returned_count": 6,
        "truncated": False,
    }
    assert normalized["redaction_summary"] == {
        "applied": True,
        "redacted_line_count": 4,
        "truncated_line_count": 0,
    }


def test_loki_logs_truncate_single_oversized_line_before_job_result() -> None:
    module = load_evidence_module()
    logs_provider = module.LokiLogsProvider.from_config(lambda _name, default: default)

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
                                f"ERROR readiness probe failed {'x' * 1_100_000}",
                            ]
                        ],
                    }
                ],
            },
        }
    )

    value = normalized["streams"][0]["values"][0]

    assert value["line"].endswith(" [TRUNCATED]")
    assert len(value["line"]) == 4096
    assert value["line_truncated"] is True
    assert value["original_line_length"] > 4096
    assert normalized["line_count"] == 1
    assert normalized["pattern_counts"]["probe_failed"] == 1
    assert normalized["matched_entries"][0]["line_truncated"] is True
    assert normalized["matched_entries"][0]["message"].endswith(" [TRUNCATED]")
    assert normalized["collection_limit"]["matched_entries"]["truncated"] is False
    assert normalized["redaction_summary"]["truncated_line_count"] == 1
    EvidenceJobResultRequest(
        agent_id="agent-1",
        lease_id="lease-1",
        status="completed",
        result={"logs": [{"source": "loki", "query_name": "large_line", **normalized}]},
    )


def test_loki_range_query_sends_exact_start_and_end_bounds() -> None:
    module = load_evidence_module()
    provider = module.LokiLogsProvider("https://loki.test")
    query = module.TelemetryQueryDefinition.from_mapping(
        {
            "source": "loki",
            "name": "recent_pod_errors",
            "description": "현재 RCA test Pod 로그",
            "query": '{k8s_pod_name="pod-1"} |~ "ERROR|FATAL"',
            "range_seconds": 120,
        }
    ).to_provider_query()
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={"status": "success", "data": {"resultType": "streams", "result": []}},
        )

    async def collect() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await provider.query(client, query)

    asyncio.run(collect())

    params = parse_qs(requests[0].url.query.decode())
    start = int(params["start"][0])
    end = int(params["end"][0])
    assert end - start == 120 * 1_000_000_000


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


def test_tempo_traces_compact_single_oversized_trace_before_job_result() -> None:
    module = load_evidence_module()
    traces_provider = module.TempoTracesProvider.from_config(lambda _name, default: default)

    normalized = traces_provider.normalize_payload(
        {
            "traces": [
                {
                    "traceID": "trace-large",
                    "rootServiceName": "checkout-api",
                    "rootTraceName": "GET /checkout",
                    "status": "error",
                    "durationMs": 842,
                    "blob": "x" * 1_100_000,
                }
            ]
        }
    )

    trace = normalized["traces"][0]

    assert normalized["trace_count"] == 1
    assert trace["traceID"] == "trace-large"
    assert trace["blob"].endswith(" [TRUNCATED]")
    assert len(trace["blob"]) == 1024
    assert "collection_limits" not in normalized
    EvidenceJobResultRequest(
        agent_id="agent-1",
        lease_id="lease-1",
        status="completed",
        result={
            "traces": {
                "source": "tempo",
                "results": {"large_trace": {"query": "{}", **normalized}},
            }
        },
    )


def test_tempo_traces_keep_analysis_when_trace_list_is_limited() -> None:
    module = load_evidence_module()
    traces_provider = module.TempoTracesProvider.from_config(lambda _name, default: default)
    definition = module.TelemetryQueryDefinition.from_mapping(
        {
            "source": "tempo",
            "name": "wide_traces",
            "description": "Large trace search result.",
            "query": "{ status = error }",
        }
    )
    results: dict[str, object] = {}

    traces_provider.append_result(
        results,
        definition.to_provider_query(),
        {
            "traces": [
                {
                    "traceID": f"trace-{index}",
                    "rootServiceName": "checkout-api",
                    "rootTraceName": f"GET /checkout/{index}",
                    "status": "error",
                    "durationMs": 800 + index,
                    **{f"label_{label_index}": "x" * 900 for label_index in range(60)},
                }
                for index in range(20)
            ]
        },
    )

    result = results["wide_traces"]

    assert result["trace_count"] == 20
    assert len(result["traces"]) < 20
    assert result["collection_limits"]["lists"]["traces"] == {
        "truncated": True,
        "original_count": 20,
        "returned_count": len(result["traces"]),
    }
    assert result["analysis"]["trace_ids"] == [f"trace-{index}" for index in range(20)]
    assert result["analysis"]["error_count"] == 20
    EvidenceJobResultRequest(
        agent_id="agent-1",
        lease_id="lease-1",
        status="completed",
        result={"traces": {"source": "tempo", "results": results}},
    )
