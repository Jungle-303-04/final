from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from typing import Any


PROMETHEUS_URL = os.environ.get("PROMETHEUS_URL", "http://localhost:9090")
LOKI_URL = os.environ.get("LOKI_URL", "http://localhost:3100")


def get_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def query_prometheus(query: str) -> dict[str, Any]:
    encoded = urllib.parse.urlencode({"query": query})
    return get_json(f"{PROMETHEUS_URL}/api/v1/query?{encoded}")


def query_loki(query: str) -> dict[str, Any]:
    encoded = urllib.parse.urlencode({"query": query, "limit": "10"})
    return get_json(f"{LOKI_URL}/loki/api/v1/query?{encoded}")


def latest_value(prometheus_response: dict[str, Any]) -> float | None:
    results = prometheus_response.get("data", {}).get("result", [])
    if not results:
        return None
    value = results[0].get("value", [])
    if len(value) < 2:
        return None
    return float(value[1])


def metric_evidence(
    query: str,
    response: dict[str, Any],
    summary_name: str,
) -> dict[str, Any]:
    latest = latest_value(response)
    return {
        "kind": "metric",
        "summary": f"{summary_name} latest value is {latest}",
        "signals": {
            "query": query,
            "latest": latest,
        },
        "source_ref": {
            "source": "prometheus",
            "query": query,
        },
    }


def log_evidence(query: str, response: dict[str, Any]) -> dict[str, Any]:
    results = response.get("data", {}).get("result", [])
    count = 0
    snippet = None
    for stream in results:
        values = stream.get("values", [])
        count += len(values)
        if values and snippet is None:
            snippet = values[-1][1]
    return {
        "kind": "log",
        "summary": f"found {count} matching error log lines",
        "signals": {
            "count": count,
            "message_snippet": snippet,
        },
        "source_ref": {
            "source": "loki",
            "query": query,
        },
    }


def main() -> None:
    print("waiting for Prometheus and Loki samples...", flush=True)
    time.sleep(20)

    metric_query = "demo_http_5xx_rate"
    restart_query = "demo_pod_restart_total"
    log_query = '{service="checkout-api"} |= "readiness"'

    metric_raw = query_prometheus(metric_query)
    restart_raw = query_prometheus(restart_query)
    log_raw = query_loki(log_query)

    drafts = [
        metric_evidence(metric_query, metric_raw, "checkout-api 5xx rate"),
        metric_evidence(restart_query, restart_raw, "checkout-api restarts"),
        log_evidence(log_query, log_raw),
    ]

    print("\n=== RAW PROMETHEUS SAMPLE ===")
    print(json.dumps(metric_raw, indent=2, ensure_ascii=False))
    print("\n=== EVIDENCE DRAFTS ===")
    print(json.dumps(drafts, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
