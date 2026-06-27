from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx
from settings import (
    DEFAULT_PROMETHEUS_BASE_URL,
    PROMETHEUS_BASE_URL_ENV,
    PROMETHEUS_TIMEOUT_SECONDS,
)
from telemetry_queries import PROMETHEUS_INSTANT_QUERIES, PrometheusInstantQuery

JsonObject = dict[str, Any]


async def send_prometheus_query(
    client: httpx.AsyncClient,
    prometheus_base_url: str,
    query: PrometheusInstantQuery,
) -> JsonObject:
    response = await client.get(
        f"{prometheus_base_url}/api/v1/query",
        params={"query": query.promql},
    )
    response.raise_for_status()
    return response.json()


async def send_dummy_queries() -> dict[str, JsonObject]:
    prometheus_base_url = os.getenv(
        PROMETHEUS_BASE_URL_ENV,
        DEFAULT_PROMETHEUS_BASE_URL,
    ).rstrip("/")
    results: dict[str, JsonObject] = {}

    async with httpx.AsyncClient(timeout=PROMETHEUS_TIMEOUT_SECONDS) as client:
        for query in PROMETHEUS_INSTANT_QUERIES:
            results[query.metric_name] = await send_prometheus_query(
                client,
                prometheus_base_url,
                query,
            )

    return results


async def main() -> None:
    results = await send_dummy_queries()

    for metric_name, payload in results.items():
        print(f"{metric_name}: {payload}")


if __name__ == "__main__":
    asyncio.run(main())
