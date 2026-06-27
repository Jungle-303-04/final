from __future__ import annotations

# Managing only "what query to send"
PROMETHEUS_INSTANT_QUERIES: dict[str, str] = {
    "http_5xx_rate": (
        'sum(rate(http_requests_total{namespace="sandbox",status=~"5.."}[5m]))'
    ),
    # "cpu_usage": "...",
    # "memory_usage": "...",
    # "request_latency_p95": "...",
}