from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
from fastapi import FastAPI
from settings import (
    AGENT_CAPABILITIES,
    CHECKOUT_APP_NAME,
    COMMAND_COMPLETED_STATUS,
    COMMAND_EXECUTION_DELAY_SECONDS,
    COMMAND_POLL_TIMEOUT_SECONDS,
    COMMAND_RESULT_MESSAGE,
    COMMAND_RETRY_DELAY_SECONDS,
    CRASHING_POD_NAME,
    CRASHING_POD_RESTARTS,
    CRASHING_POD_STATUS,
    DEFAULT_AGENT_ID,
    DEFAULT_MANAGEMENT_BASE_URL,
    DEFAULT_SERVICE_PORT,
    EVIDENCE_INTERVAL_ENV,
    FAKE_HTTP_5XX_RATE,
    FAKE_LOKI_SOURCE,
    FAKE_NODE_CPU,
    FAKE_NODE_MEMORY_MB,
    FAKE_OTEL_SOURCE,
    FAKE_PROMETHEUS_SOURCE,
    HOSTNAME_ENV,
    HTTP_TIMEOUT_SECONDS,
    K8S_BACKOFF_EVENT,
    K8S_READINESS_FAILED_EVENT,
    LOG_LEVEL,
    LOKI_ERROR_LINE,
    LOKI_WARNING_LINE,
    MANAGEMENT_BASE_URL_ENV,
    OTEL_SLOW_SPAN,
    PROMETHEUS_VECTOR_VALUE,
    REGISTER_RETRY_DELAY_SECONDS,
    SERVICE_HOST,
    SERVICE_PORT_ENV,
    TARGET_CLUSTER_ID_ENV,
)
from uvicorn import Config, Server

from packages.config.constants import DEFAULT_EVIDENCE_INTERVAL_SECONDS, DEFAULT_TARGET_CLUSTER_ID
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.interfaces import CommandRecord, ManagementPlaneClient


class HttpManagementPlaneClient:
    def __init__(self, base_url: str, timeout_seconds: int = HTTP_TIMEOUT_SECONDS) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=timeout_seconds)

    async def __aenter__(self) -> HttpManagementPlaneClient:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.close()

    async def close(self) -> None:
        await self.client.aclose()

    async def register_agent(self, cluster_id: str, agent_id: str, capabilities: list[str]) -> None:
        await self.client.post(
            f"{self.base_url}/agent/connect",
            json={
                "cluster_id": cluster_id,
                "agent_id": agent_id,
                "capabilities": capabilities,
            },
        )

    async def ship_evidence(self, evidence: JsonObject) -> int:
        response = await self.client.post(f"{self.base_url}/agent/evidence", json=evidence)
        return response.status_code

    async def poll_command(self, cluster_id: str, timeout_seconds: int) -> CommandRecord | None:
        response = await self.client.get(
            f"{self.base_url}/agent/commands/poll",
            params={"cluster_id": cluster_id, "timeout": timeout_seconds},
        )
        response.raise_for_status()
        return response.json().get("command")

    async def complete_command(self, command_id: str, result: JsonObject) -> None:
        await self.client.post(f"{self.base_url}/agent/commands/{command_id}/result", json=result)


class TargetClusterAgent:
    def __init__(self, client: ManagementPlaneClient | None = None) -> None:
        self.base_url = env(MANAGEMENT_BASE_URL_ENV, DEFAULT_MANAGEMENT_BASE_URL).rstrip("/")
        self.cluster_id = env(TARGET_CLUSTER_ID_ENV, DEFAULT_TARGET_CLUSTER_ID)
        self.interval = int(env(EVIDENCE_INTERVAL_ENV, DEFAULT_EVIDENCE_INTERVAL_SECONDS))
        self.client = client

    async def run(self) -> None:
        if self.client is not None:
            await self.run_with_client(self.client)
            return
        async with HttpManagementPlaneClient(self.base_url) as client:
            await self.run_with_client(client)

    async def run_with_client(self, client: ManagementPlaneClient) -> None:
        await self.register(client)
        await asyncio.gather(self.ship_evidence(client), self.poll_commands(client))

    async def register(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                await client.register_agent(
                    self.cluster_id,
                    env(HOSTNAME_ENV, DEFAULT_AGENT_ID),
                    AGENT_CAPABILITIES,
                )
                return
            except Exception as exc:
                print(f"agent waiting for management gateway: {exc}", flush=True)
                await asyncio.sleep(REGISTER_RETRY_DELAY_SECONDS)

    async def ship_evidence(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                status_code = await client.ship_evidence(self.fake_evidence())
                print(f"evidence shipped status={status_code}", flush=True)
            except Exception as exc:
                print(f"evidence ship failed: {exc}", flush=True)
            await asyncio.sleep(self.interval)

    async def poll_commands(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                command = await client.poll_command(self.cluster_id, COMMAND_POLL_TIMEOUT_SECONDS)
                if command:
                    command_id = command["command_id"]
                    action = command["action"]
                    print(
                        f"agent executing command {command_id} action={action}",
                        flush=True,
                    )
                    await asyncio.sleep(COMMAND_EXECUTION_DELAY_SECONDS)
                    await client.complete_command(
                        command_id,
                        {
                            "status": COMMAND_COMPLETED_STATUS,
                            "cluster_id": self.cluster_id,
                            "applied": True,
                            "message": COMMAND_RESULT_MESSAGE,
                        },
                    )
            except Exception as exc:
                print(f"command polling failed: {exc}", flush=True)
                await asyncio.sleep(COMMAND_RETRY_DELAY_SECONDS)

    def fake_evidence(self) -> JsonObject:
        return {
            "cluster_id": self.cluster_id,
            "kubernetes": {
                "pods": [
                    {
                        "name": CRASHING_POD_NAME,
                        "status": CRASHING_POD_STATUS,
                        "restarts": CRASHING_POD_RESTARTS,
                    }
                ],
                "events": [K8S_READINESS_FAILED_EVENT, K8S_BACKOFF_EVENT],
            },
            "metrics": {
                "source": FAKE_PROMETHEUS_SOURCE,
                "cpu": FAKE_NODE_CPU,
                "memory_mb": FAKE_NODE_MEMORY_MB,
                "http_5xx_rate": FAKE_HTTP_5XX_RATE,
            },
            "logs": [
                {
                    "source": FAKE_LOKI_SOURCE,
                    "line": LOKI_ERROR_LINE,
                },
                {"source": FAKE_LOKI_SOURCE, "line": LOKI_WARNING_LINE},
            ],
            "traces": {"source": FAKE_OTEL_SOURCE, "slow_span": OTEL_SLOW_SPAN},
        }


def create_fake_telemetry_app(kind: str) -> FastAPI:
    app = FastAPI(title=f"fake-{kind}")

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": f"fake-{kind}"}

    @app.get("/{path:path}")
    async def catch_all(path: str) -> dict[str, Any]:
        if kind == "prometheus":
            return {
                "status": "success",
                "data": {
                    "resultType": "vector",
                    "result": [
                        {
                            "metric": {"pod": CHECKOUT_APP_NAME},
                            "value": [time.time(), PROMETHEUS_VECTOR_VALUE],
                        }
                    ],
                },
            }
        if kind == "loki":
            return {
                "status": "success",
                "data": {
                    "result": [
                        {
                            "stream": {"pod": CHECKOUT_APP_NAME},
                            "values": [[str(int(time.time() * 1e9)), K8S_READINESS_FAILED_EVENT]],
                        }
                    ]
                },
            }
        return {"status": "ok", "telemetry": "fake-otel", "path": path}

    return app


async def run_fake_telemetry(kind: str) -> None:
    await Server(
        Config(
            create_fake_telemetry_app(kind),
            host=SERVICE_HOST,
            port=int(env(SERVICE_PORT_ENV, DEFAULT_SERVICE_PORT)),
            log_level=LOG_LEVEL,
        )
    ).serve()
