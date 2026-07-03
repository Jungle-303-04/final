from __future__ import annotations

import httpx
from queries import PrometheusInstantQuery

from config import (
    DEFAULT_PROMETHEUS_BASE_URL,
    PROMETHEUS_BASE_URL_ENV,
    PROMETHEUS_TIMEOUT_SECONDS,
)
from packages.contracts.event_bus.interfaces import JsonObject
from providers.base import TRACER, ConfigReader


class PrometheusMetricsProvider:
    evidence_key = "metrics"
    source = "prometheus"
    span_name = "prometheus.collect"
    query_count_attribute = "prometheus.query_count"
    result_count_attribute = "prometheus.result_count"
    timeout_seconds = PROMETHEUS_TIMEOUT_SECONDS
    failure_message = "prometheus metrics collection failed"
    queries: tuple[PrometheusInstantQuery, ...] = ()

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    @classmethod
    def from_config(cls, read_config: ConfigReader) -> PrometheusMetricsProvider:
        return cls(read_config(PROMETHEUS_BASE_URL_ENV, DEFAULT_PROMETHEUS_BASE_URL))

    async def query(
        self,
        client: httpx.AsyncClient,
        telemetry_query: PrometheusInstantQuery,
    ) -> JsonObject:
        with TRACER.start_as_current_span("prometheus.query") as span:
            span.attr("prometheus.query", telemetry_query.promql)
            response = await client.get(
                f"{self.base_url}/api/v1/query",
                params={"query": telemetry_query.promql},
            )
            span.http_status(response.status_code)
            response.raise_for_status()
            return response.json()

    def empty_results(self) -> JsonObject:
        return {}

    def append_result(
        self,
        results: JsonObject,
        telemetry_query: PrometheusInstantQuery,
        payload: JsonObject,
    ) -> None:
        results[telemetry_query.metric_name] = {
            "query": telemetry_query.promql,
            **self.normalize_payload(payload),
        }

    def build_response(self, results: JsonObject) -> JsonObject:
        return {
            "source": self.source,
            "results": results,
        }

    def normalize_payload(self, payload: JsonObject) -> JsonObject:
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
