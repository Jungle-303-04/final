from __future__ import annotations

import httpx
from settings import (
    DEFAULT_TEMPO_BASE_URL,
    TEMPO_BASE_URL_ENV,
    TEMPO_QUERY_LIMIT,
    TEMPO_TIMEOUT_SECONDS,
)
from telemetry_queries import OPEN_TELEMETRY_SPAN_QUERIES, OpenTelemetrySpanQuery

from packages.contracts.event_bus.interfaces import JsonObject
from providers.base import TRACER, ConfigReader


class TempoTracesProvider:
    evidence_key = "traces"
    source = "tempo"
    span_name = "tempo.collect"
    query_count_attribute = "tempo.query_count"
    result_count_attribute = "tempo.result_count"
    timeout_seconds = TEMPO_TIMEOUT_SECONDS
    failure_message = "tempo trace collection failed"
    queries = OPEN_TELEMETRY_SPAN_QUERIES

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    @classmethod
    def from_config(cls, read_config: ConfigReader) -> TempoTracesProvider:
        return cls(read_config(TEMPO_BASE_URL_ENV, DEFAULT_TEMPO_BASE_URL))

    async def query(
        self,
        client: httpx.AsyncClient,
        telemetry_query: OpenTelemetrySpanQuery,
    ) -> JsonObject:
        with TRACER.start_as_current_span("tempo.search") as span:
            span.attr("tempo.traceql", telemetry_query.traceql)
            response = await client.get(
                f"{self.base_url}/api/search",
                params={"q": telemetry_query.traceql, "limit": TEMPO_QUERY_LIMIT},
            )
            span.attr("http.status_code", response.status_code)
            response.raise_for_status()
            return response.json()

    def empty_results(self) -> JsonObject:
        return {}

    def append_result(
        self,
        results: JsonObject,
        telemetry_query: OpenTelemetrySpanQuery,
        payload: JsonObject,
    ) -> None:
        results[telemetry_query.query_name] = {
            "query": telemetry_query.traceql,
            **self.normalize_payload(payload),
        }

    def build_response(self, results: JsonObject) -> JsonObject:
        return {
            "source": self.source,
            "results": results,
        }

    def normalize_payload(self, payload: JsonObject) -> JsonObject:
        traces = payload.get("traces", [])
        if not isinstance(traces, list):
            traces = []

        return {
            "traces": traces,
            "trace_count": len(traces),
            "raw": payload,
        }
