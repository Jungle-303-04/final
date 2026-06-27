from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PrometheusInstantQuery:
    metric_name: str
    description: str
    promql: str


# Managing only "what query to send"
PROMETHEUS_INSTANT_QUERIES: tuple[PrometheusInstantQuery, ...] = (
    PrometheusInstantQuery(
        metric_name="http_5xx_rate",
        description="HTTP 5xx request rate in the sandbox namespace over 5 minutes.",
        promql='sum(rate(http_requests_total{namespace="sandbox",status=~"5.."}[5m]))',
    ),
    PrometheusInstantQuery(
        metric_name="cpu_usage_seconds_rate",
        description="Container CPU usage rate in the sandbox namespace over 5 minutes.",
        promql=(
            'sum(rate(container_cpu_usage_seconds_total{namespace="sandbox",container!="POD"}[5m]))'
        ),
    ),
    PrometheusInstantQuery(
        metric_name="request_latency_p95",
        description="95th percentile HTTP request latency in the sandbox namespace over 5 minutes.",
        promql=(
            "histogram_quantile(0.95, "
            'sum(rate(http_request_duration_seconds_bucket{namespace="sandbox"}[5m])) by (le))'
        ),
    ),
)
