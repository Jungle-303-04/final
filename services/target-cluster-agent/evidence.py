from __future__ import annotations

from collections.abc import Callable

import httpx
from settings import (
    LOKI_QUERY_LIMIT,
    LOKI_TIMEOUT_SECONDS,
    PROMETHEUS_TIMEOUT_SECONDS,
    TEMPO_QUERY_LIMIT,
    TEMPO_TIMEOUT_SECONDS,
)
from telemetry_queries import (
    LOKI_LOG_QUERIES,
    OPEN_TELEMETRY_SPAN_QUERIES,
    PROMETHEUS_INSTANT_QUERIES,
)
from telemetry_tracing import get_tracer, mark_span_error

from packages.contracts.event_bus.interfaces import JsonObject

TRACER = get_tracer("target-cluster-agent.evidence")


class EvidenceCollector:
    def __init__(
        self,
        prometheus_base_url: str,
        loki_base_url: str,
        tempo_base_url: str,
        fake_evidence: Callable[[], JsonObject],
    ) -> None:
        self.prometheus_base_url = prometheus_base_url.rstrip("/")
        self.loki_base_url = loki_base_url.rstrip("/")
        self.tempo_base_url = tempo_base_url.rstrip("/")
        self.fake_evidence = fake_evidence

    # Build the full evidence payload; telemetry sections are replaced with real query data.
    async def collect_evidence(self) -> JsonObject:
        with TRACER.start_as_current_span("evidence.collect") as span:
            evidence = self.fake_evidence()
            evidence["metrics"] = await self.collect_prometheus_metrics()
            evidence["logs"] = await self.collect_loki_logs()
            evidence["traces"] = await self.collect_tempo_traces()
            span.set_attribute("evidence.has_metrics", "metrics" in evidence)
            span.set_attribute("evidence.has_logs", "logs" in evidence)
            span.set_attribute("evidence.has_traces", "traces" in evidence)
            return evidence

    # Run every configured Prometheus query and package the normalized results.
    async def collect_prometheus_metrics(self) -> JsonObject:
        """Collect configured Prometheus query results."""
        with TRACER.start_as_current_span("prometheus.collect") as span:
            span.set_attribute("prometheus.query_count", len(PROMETHEUS_INSTANT_QUERIES))
            try:
                async with httpx.AsyncClient(timeout=PROMETHEUS_TIMEOUT_SECONDS) as client:
                    query_results = {}

                    for metric_query in PROMETHEUS_INSTANT_QUERIES:
                        payload = await self.query_prometheus(client, metric_query.promql)

                        query_results[metric_query.metric_name] = {
                            "query": metric_query.promql,
                            # ** is the dictionary unpacking syntax.
                            **self.normalize_prometheus_payload(payload),
                        }

                span.set_attribute("prometheus.result_count", len(query_results))
                return {
                    "source": "prometheus",
                    "results": query_results,
                }

            except Exception as exc:
                mark_span_error(span, exc)
                print(f"prometheus metrics collection failed: {exc}", flush=True)
                return self.fake_evidence()["metrics"]

    # Actually request a single query to Prometheus and return the parsed response body.
    async def query_prometheus(self, client: httpx.AsyncClient, query: str) -> JsonObject:
        with TRACER.start_as_current_span("prometheus.query") as span:
            span.set_attribute("prometheus.query", query)
            response = await client.get(
                f"{self.prometheus_base_url}/api/v1/query",
                params={"query": query},
            )
            span.set_attribute("http.status_code", response.status_code)
            response.raise_for_status()
            return response.json()

    # Convert Prometheus response shapes into a stable evidence-friendly structure.
    def normalize_prometheus_payload(self, payload: JsonObject) -> JsonObject:
        data = payload.get("data", {})
        result_type = data.get("resultType")  # vector, matrix, scalar, string
        result = data.get("result", [])

        if result_type == "vector":  # time series values
            samples = []
            for item in result:
                raw_value = item.get("value", [])
                samples.append(
                    {
                        "metric": item.get("metric", {}),
                        "timestamp": raw_value[0] if len(raw_value) >= 1 else None,
                        "value": float(raw_value[1]) if len(raw_value) >= 2 else None,
                    }
                )

            return {
                "result_type": result_type,
                "samples": samples,
                "raw": payload,
            }

        return {  # other result type(not vector)
            "result_type": result_type,
            "result": result,
            "raw": payload,
        }

    # Run every configured Loki query and package the normalized results.
    async def collect_loki_logs(self) -> list[JsonObject]:
        """Collect configured Loki query results."""
        with TRACER.start_as_current_span("loki.collect") as span:
            span.set_attribute("loki.query_count", len(LOKI_LOG_QUERIES))
            try:
                async with httpx.AsyncClient(timeout=LOKI_TIMEOUT_SECONDS) as client:
                    log_results = []

                    for log_query in LOKI_LOG_QUERIES:
                        payload = await self.query_loki(client, log_query.logql)

                        log_results.append(
                            {
                                "source": "loki",
                                "query_name": log_query.query_name,
                                "query": log_query.logql,
                                **self.normalize_loki_payload(payload),
                            }
                        )

                span.set_attribute("loki.result_count", len(log_results))
                return log_results

            except Exception as exc:
                mark_span_error(span, exc)
                print(f"loki log collection failed: {exc}", flush=True)
                return self.fake_evidence()["logs"]

    # Actually request a single range query from Loki and return the parsed response body.
    async def query_loki(self, client: httpx.AsyncClient, query: str) -> JsonObject:
        with TRACER.start_as_current_span("loki.query_range") as span:
            span.set_attribute("loki.query", query)
            response = await client.get(
                f"{self.loki_base_url}/loki/api/v1/query_range",
                params={"query": query, "limit": LOKI_QUERY_LIMIT},
            )
            span.set_attribute("http.status_code", response.status_code)
            response.raise_for_status()
            return response.json()

    # Convert Loki stream responses into a stable evidence-friendly structure.
    def normalize_loki_payload(self, payload: JsonObject) -> JsonObject:
        data = payload.get("data", {})
        result_type = data.get("resultType")
        result = data.get("result", [])
        streams = []

        for item in result:
            values = []
            for raw_entry in item.get("values", []):
                values.append(
                    {
                        "timestamp": raw_entry[0] if len(raw_entry) >= 1 else None,
                        "line": raw_entry[1] if len(raw_entry) >= 2 else None,
                    }
                )

            streams.append(
                {
                    "stream": item.get("stream", {}),
                    "values": values,
                }
            )

        return {
            "result_type": result_type,
            "streams": streams,
            "line_count": sum(len(stream["values"]) for stream in streams),
            "raw": payload,
        }

    # Run every configured Tempo TraceQL search and package normalized trace summaries.
    async def collect_tempo_traces(self) -> JsonObject:
        """Collect configured Tempo trace search results."""
        with TRACER.start_as_current_span("tempo.collect") as span:
            span.set_attribute("tempo.query_count", len(OPEN_TELEMETRY_SPAN_QUERIES))
            try:
                async with httpx.AsyncClient(timeout=TEMPO_TIMEOUT_SECONDS) as client:
                    trace_results = {}

                    for span_query in OPEN_TELEMETRY_SPAN_QUERIES:
                        payload = await self.query_tempo(client, span_query.traceql)

                        trace_results[span_query.query_name] = {
                            "query": span_query.traceql,
                            **self.normalize_tempo_payload(payload),
                        }

                span.set_attribute("tempo.result_count", len(trace_results))
                return {
                    "source": "tempo",
                    "results": trace_results,
                }

            except Exception as exc:
                mark_span_error(span, exc)
                print(f"tempo trace collection failed: {exc}", flush=True)
                return self.fake_evidence()["traces"]

    # Actually request one TraceQL search from Tempo and return the parsed response body.
    async def query_tempo(self, client: httpx.AsyncClient, traceql: str) -> JsonObject:
        with TRACER.start_as_current_span("tempo.search") as span:
            span.set_attribute("tempo.traceql", traceql)
            response = await client.get(
                f"{self.tempo_base_url}/api/search",
                params={"q": traceql, "limit": TEMPO_QUERY_LIMIT},
            )
            span.set_attribute("http.status_code", response.status_code)
            response.raise_for_status()
            return response.json()

    # Convert Tempo search responses into a stable evidence-friendly structure.
    def normalize_tempo_payload(self, payload: JsonObject) -> JsonObject:
        traces = payload.get("traces", [])
        if not isinstance(traces, list):
            traces = []

        return {
            "traces": traces,
            "trace_count": len(traces),
            "raw": payload,
        }
