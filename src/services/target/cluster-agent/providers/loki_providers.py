from __future__ import annotations

import time

import httpx
from queries import LokiLogQuery
from telemetry_registry import telemetry

from config import (
    DEFAULT_LOKI_BASE_URL,
    LOKI_BASE_URL_ENV,
    LOKI_QUERY_LIMIT,
    LOKI_TIMEOUT_SECONDS,
)
from packages.contracts.event_bus.interfaces import JsonObject
from providers.base import TRACER, ConfigReader


@telemetry.source(
    source="loki",
    evidence_key="logs",
    query_type=LokiLogQuery,
    empty_payload=list,  # log payload's shape is list
    range_query_type=LokiLogQuery,
)
class LokiLogsProvider:
    """Collect log data from Loki.
    It builds the logs evidence bucket.
    """

    span_name = "loki.collect"
    query_count_attribute = "loki.query_count"
    result_count_attribute = "loki.result_count"
    timeout_seconds = LOKI_TIMEOUT_SECONDS
    failure_message = "loki log collection failed"
    queries: tuple[LokiLogQuery, ...] = ()

    def __init__(self, base_url: str) -> None:
        """Store the Loki base URL without a trailing slash."""
        self.base_url = base_url.rstrip("/")

    @classmethod
    def from_config(cls, read_config: ConfigReader) -> LokiLogsProvider:
        """Create the provider from agent config values."""
        return cls(read_config(LOKI_BASE_URL_ENV, DEFAULT_LOKI_BASE_URL))

    async def query(
        self,
        client: httpx.AsyncClient,
        telemetry_query: LokiLogQuery,
    ) -> JsonObject:
        """Run one Loki query and return the raw API result."""
        with TRACER.start_as_current_span("loki.query_range") as span:
            span.attr("loki.query", telemetry_query.logql)
            params: dict[str, str | int] = {
                "query": telemetry_query.logql,
                "limit": LOKI_QUERY_LIMIT,
            }
            if telemetry_query.range_seconds is not None:
                end_ns = time.time_ns()
                params.update(
                    {
                        "start": end_ns - telemetry_query.range_seconds * 1_000_000_000,
                        "end": end_ns,
                        "direction": "backward",
                    }
                )
            response = await client.get(
                f"{self.base_url}/loki/api/v1/query_range",
                params=params,
            )
            span.http_status(response.status_code)
            response.raise_for_status()
            return response.json()

    def empty_results(self) -> list[JsonObject]:
        """Create an empty logs evidence bucket."""
        return []

    def append_result(
        self,
        results: list[JsonObject],
        telemetry_query: LokiLogQuery,
        payload: JsonObject,
    ) -> None:
        """Normalize one Loki result and add it to the bucket."""
        result = {
            "source": self.source,
            "query_name": telemetry_query.query_name,
            "query": telemetry_query.logql,
            **self.normalize_payload(payload),
        }
        if telemetry_query.range_seconds is not None:
            result["range_seconds"] = telemetry_query.range_seconds
        results.append(result)

    def build_response(self, results: list[JsonObject]) -> list[JsonObject]:
        """Return the finished logs evidence bucket."""
        return results

    def normalize_payload(self, payload: JsonObject) -> JsonObject:
        """Turn a Loki response into stream and line summaries."""
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
        }
