from __future__ import annotations

import httpx
from queries import OpenTelemetrySpanQuery
from telemetry_registry import telemetry

from config import (
    DEFAULT_TEMPO_BASE_URL,
    TEMPO_BASE_URL_ENV,
    TEMPO_QUERY_LIMIT,
    TEMPO_TIMEOUT_SECONDS,
)
from packages.contracts.event_bus.interfaces import JsonObject
from providers.base import TRACER, ConfigReader
from providers.tempo_analysis import build_trace_analysis


@telemetry.source(
    source="tempo",
    evidence_key="traces",
    query_type=OpenTelemetrySpanQuery,
)
class TempoTracesProvider:
    """Collect trace data from Tempo.
    It builds the traces evidence bucket.
    """

    span_name = "tempo.collect"
    query_count_attribute = "tempo.query_count"
    result_count_attribute = "tempo.result_count"
    timeout_seconds = TEMPO_TIMEOUT_SECONDS
    failure_message = "tempo trace collection failed"
    queries: tuple[OpenTelemetrySpanQuery, ...] = ()

    def __init__(self, base_url: str) -> None:
        """Store the Tempo base URL without a trailing slash."""
        self.base_url = base_url.rstrip("/")

    @classmethod
    def from_config(cls, read_config: ConfigReader) -> TempoTracesProvider:
        """Create the provider from agent config values."""
        return cls(read_config(TEMPO_BASE_URL_ENV, DEFAULT_TEMPO_BASE_URL))

    async def query(
        self,
        client: httpx.AsyncClient,
        telemetry_query: OpenTelemetrySpanQuery,
    ) -> JsonObject:
        """Run one Tempo search query and return the raw result."""
        with TRACER.start_as_current_span("tempo.search") as span:
            span.attr("tempo.traceql", telemetry_query.traceql)
            response = await client.get(
                f"{self.base_url}/api/search",
                params={"q": telemetry_query.traceql, "limit": TEMPO_QUERY_LIMIT},
            )
            span.http_status(response.status_code)
            response.raise_for_status()
            return response.json()

    def empty_results(self) -> JsonObject:
        """Create an empty traces evidence bucket."""
        return {}

    def append_result(
        self,
        results: JsonObject,
        telemetry_query: OpenTelemetrySpanQuery,
        payload: JsonObject,
    ) -> None:
        """Normalize one Tempo result and save it by query name."""
        normalized = self.normalize_payload(payload)
        results[telemetry_query.query_name] = {
            "query": telemetry_query.traceql,
            **normalized,
            **build_trace_analysis(normalized),
        }

    def build_response(self, results: JsonObject) -> JsonObject:
        """Return the finished traces evidence bucket."""
        return {
            "source": self.source,
            "results": results,
        }

    def normalize_payload(self, payload: JsonObject) -> JsonObject:
        """Turn a Tempo response into trace list and count data."""
        traces = payload.get("traces", [])
        if not isinstance(traces, list):
            traces = []

        return {
            "traces": traces,
            "trace_count": len(traces),
        }
