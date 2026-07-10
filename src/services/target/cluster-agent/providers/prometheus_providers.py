from __future__ import annotations

import time

import httpx
from queries import PrometheusInstantQuery, PrometheusRangeQuery
from telemetry_registry import telemetry

from config import (
    DEFAULT_PROMETHEUS_BASE_URL,
    PROMETHEUS_BASE_URL_ENV,
    PROMETHEUS_TIMEOUT_SECONDS,
)
from packages.contracts.event_bus.interfaces import JsonObject
from providers.base import TRACER, ConfigReader
from providers.prometheus_analysis import build_metric_analysis


@telemetry.source(
    source="prometheus",
    evidence_key="metrics",
    query_type=PrometheusInstantQuery,
    range_query_type=PrometheusRangeQuery,
)
class PrometheusMetricsProvider:
    """Collect metric data from Prometheus.
    It builds the metrics evidence bucket.
    """

    span_name = "prometheus.collect"
    query_count_attribute = "prometheus.query_count"
    result_count_attribute = "prometheus.result_count"
    timeout_seconds = PROMETHEUS_TIMEOUT_SECONDS
    failure_message = "prometheus metrics collection failed"
    queries: tuple[PrometheusInstantQuery | PrometheusRangeQuery, ...] = ()

    def __init__(self, base_url: str) -> None:
        """Store the Prometheus base URL without a trailing slash."""
        self.base_url = base_url.rstrip("/")

    @classmethod
    def from_config(cls, read_config: ConfigReader) -> PrometheusMetricsProvider:
        """Create the provider from agent config values."""
        return cls(read_config(PROMETHEUS_BASE_URL_ENV, DEFAULT_PROMETHEUS_BASE_URL))

    async def query(
        self,
        client: httpx.AsyncClient,
        telemetry_query: PrometheusInstantQuery | PrometheusRangeQuery,
    ) -> JsonObject:
        """Run the right Prometheus query type for one request."""
        if isinstance(telemetry_query, PrometheusRangeQuery):
            return await self.query_range(client, telemetry_query)
        return await self.query_instant(client, telemetry_query)

    async def query_instant(
        self,
        client: httpx.AsyncClient,
        telemetry_query: PrometheusInstantQuery,
    ) -> JsonObject:
        """Run an instant Prometheus query and return the raw result."""
        with TRACER.start_as_current_span("prometheus.query") as span:
            span.attr("prometheus.query", telemetry_query.promql)
            response = await client.get(
                f"{self.base_url}/api/v1/query",
                params={"query": telemetry_query.promql},
            )
            span.http_status(response.status_code)
            response.raise_for_status()
            return response.json()

    async def query_range(
        self,
        client: httpx.AsyncClient,
        telemetry_query: PrometheusRangeQuery,
    ) -> JsonObject:
        """Run a range Prometheus query over a time window."""
        end = time.time()
        start = end - telemetry_query.range_seconds
        step = telemetry_query.step_seconds or max(1, telemetry_query.range_seconds // 30)
        with TRACER.start_as_current_span("prometheus.query_range") as span:
            span.attr("prometheus.query", telemetry_query.promql)
            span.attr("prometheus.range_seconds", telemetry_query.range_seconds)
            response = await client.get(
                f"{self.base_url}/api/v1/query_range",
                params={
                    "query": telemetry_query.promql,
                    "start": f"{start:.3f}",
                    "end": f"{end:.3f}",
                    "step": str(step),
                },
            )
            span.http_status(response.status_code)
            response.raise_for_status()
            return response.json()

    def empty_results(self) -> JsonObject:
        """Create an empty metrics evidence bucket."""
        return {}

    def append_result(
        self,
        results: JsonObject,
        telemetry_query: PrometheusInstantQuery | PrometheusRangeQuery,
        payload: JsonObject,
    ) -> None:
        """Normalize one metric result and save it by metric name."""
        normalized = self.normalize_payload(payload)
        results[telemetry_query.metric_name] = {
            "query": telemetry_query.promql,
            **self.query_metadata(telemetry_query),
            **normalized,
            **build_metric_analysis(
                telemetry_query.metric_name,
                telemetry_query.promql,
                normalized,
            ),
        }

    def build_response(self, results: JsonObject) -> JsonObject:
        """Return the finished metrics evidence bucket."""
        return {
            "source": self.source,
            "results": results,
        }

    def normalize_payload(self, payload: JsonObject) -> JsonObject:
        """Turn a Prometheus response into samples or series data."""
        data = payload.get("data", {})
        result_type = data.get("resultType")  # vector, matrix, scalar, string
        result = data.get("result", [])

        if result_type == "vector":  # 시계열 값
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
            }

        if result_type == "matrix":  # range query 시계열 값
            series = []
            for item in result:
                values = []
                for raw_value in item.get("values", []):
                    values.append(
                        {
                            "timestamp": raw_value[0] if len(raw_value) >= 1 else None,
                            "value": float(raw_value[1]) if len(raw_value) >= 2 else None,
                        }
                    )
                series.append(
                    {
                        "metric": item.get("metric", {}),
                        "values": values,
                    }
                )

            return {
                "result_type": result_type,
                "series": series,
                "point_count": sum(len(item["values"]) for item in series),
            }

        return {  # 그 외 result type(vector/matrix 아님)
            "result_type": result_type,
            "result": result,
        }

    def query_metadata(
        self,
        telemetry_query: PrometheusInstantQuery | PrometheusRangeQuery,
    ) -> JsonObject:
        """Describe if the query was instant or range based."""
        if not isinstance(telemetry_query, PrometheusRangeQuery):
            return {"query_mode": "instant"}
        return {
            "query_mode": "range",
            "range_seconds": telemetry_query.range_seconds,
            "step_seconds": telemetry_query.step_seconds,
        }
