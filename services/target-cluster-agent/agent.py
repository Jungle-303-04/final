from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
from fastapi import FastAPI
from settings import Settings
from uvicorn import Config, Server

from packages.config.constants import Target
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway.fields import Gateway
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.interfaces import CommandRecord, ManagementPlaneClient


class HttpManagementPlaneClient:
    def __init__(self, base_url: str, timeout_seconds: int = Settings.HTTP_TIMEOUT_SECONDS) -> None:
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
            f"{self.base_url}{gateway_routes.AGENT_CONNECT_PATH}",
            json={
                Gateway.CLUSTER_ID: cluster_id,
                Gateway.AGENT_ID: agent_id,
                Gateway.CAPABILITIES: capabilities,
            },
        )

    async def ship_evidence(self, evidence: JsonObject) -> int:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.AGENT_EVIDENCE_PATH}",
            json=evidence,
        )
        return response.status_code

    async def poll_command(self, cluster_id: str, timeout_seconds: int) -> CommandRecord | None:
        response = await self.client.get(
            f"{self.base_url}{gateway_routes.AGENT_COMMAND_POLL_PATH}",
            params={Gateway.CLUSTER_ID: cluster_id, "timeout": timeout_seconds},
        )
        response.raise_for_status()
        return response.json().get(Gateway.COMMAND)

    async def complete_command(self, command_id: str, result: JsonObject) -> None:
        await self.client.post(
            f"{self.base_url}{gateway_routes.agent_command_result_path(command_id)}",
            json=result,
        )


class TargetClusterAgent:
    def __init__(self, client: ManagementPlaneClient | None = None) -> None:
        self.base_url = env(
            Settings.MANAGEMENT_BASE_URL_ENV,
            Settings.DEFAULT_MANAGEMENT_BASE_URL,
        ).rstrip("/")
        self.cluster_id = env(Settings.TARGET_CLUSTER_ID_ENV, Target.DEFAULT_CLUSTER_ID)
        self.interval = int(
            env(Settings.EVIDENCE_INTERVAL_ENV, Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS)
        )
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
                    env(Settings.HOSTNAME_ENV, Settings.DEFAULT_AGENT_ID),
                    Settings.AGENT_CAPABILITIES,
                )
                return
            except Exception as exc:
                print(f"agent waiting for management gateway: {exc}", flush=True)
                await asyncio.sleep(Settings.REGISTER_RETRY_DELAY_SECONDS)

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
                command = await client.poll_command(
                    self.cluster_id,
                    Settings.COMMAND_POLL_TIMEOUT_SECONDS,
                )
                if command:
                    command_id = command[Gateway.COMMAND_ID]
                    action = command[Gateway.ACTION]
                    print(
                        f"agent executing command {command_id} action={action}",
                        flush=True,
                    )
                    await asyncio.sleep(Settings.COMMAND_EXECUTION_DELAY_SECONDS)
                    await client.complete_command(
                        command_id,
                        {
                            Gateway.STATUS: Settings.COMMAND_COMPLETED_STATUS,
                            Gateway.CLUSTER_ID: self.cluster_id,
                            Gateway.APPLIED: True,
                            Gateway.MESSAGE: Settings.COMMAND_RESULT_MESSAGE,
                        },
                    )
            except Exception as exc:
                print(f"command polling failed: {exc}", flush=True)
                await asyncio.sleep(Settings.COMMAND_RETRY_DELAY_SECONDS)

    def fake_evidence(self) -> JsonObject:
        return {
            Gateway.CLUSTER_ID: self.cluster_id,
            "kubernetes": {
                "pods": [
                    {
                        "name": Settings.CRASHING_POD_NAME,
                        "status": Settings.CRASHING_POD_STATUS,
                        "restarts": Settings.CRASHING_POD_RESTARTS,
                    }
                ],
                "events": [Settings.K8S_READINESS_FAILED_EVENT, Settings.K8S_BACKOFF_EVENT],
            },
            "metrics": {
                "source": Settings.FAKE_PROMETHEUS_SOURCE,
                "cpu": Settings.FAKE_NODE_CPU,
                "memory_mb": Settings.FAKE_NODE_MEMORY_MB,
                "http_5xx_rate": Settings.FAKE_HTTP_5XX_RATE,
            },
            "logs": [
                {
                    "source": Settings.FAKE_LOKI_SOURCE,
                    "line": Settings.LOKI_ERROR_LINE,
                },
                {"source": Settings.FAKE_LOKI_SOURCE, "line": Settings.LOKI_WARNING_LINE},
            ],
            "traces": {"source": Settings.FAKE_OTEL_SOURCE, "slow_span": Settings.OTEL_SLOW_SPAN},
        }


def create_fake_telemetry_app(kind: str) -> FastAPI:
    app = FastAPI(title=f"fake-{kind}")

    @app.get(gateway_routes.HEALTHZ_PATH)
    async def healthz() -> dict[str, str]:
        return {
            Gateway.STATUS: Gateway.STATUS_OK,
            Gateway.SERVICE: f"fake-{kind}",
        }

    @app.get(gateway_routes.FAKE_TELEMETRY_CATCH_ALL_PATH)
    async def catch_all(path: str) -> dict[str, Any]:
        if kind == "prometheus":
            return {
                "status": "success",
                "data": {
                    "resultType": "vector",
                    "result": [
                        {
                            "metric": {"pod": Settings.CHECKOUT_APP_NAME},
                            "value": [time.time(), Settings.PROMETHEUS_VECTOR_VALUE],
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
                            "stream": {"pod": Settings.CHECKOUT_APP_NAME},
                            "values": [
                                [str(int(time.time() * 1e9)), Settings.K8S_READINESS_FAILED_EVENT]
                            ],
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
            host=Settings.SERVICE_HOST,
            port=int(env(Settings.SERVICE_PORT_ENV, Settings.DEFAULT_SERVICE_PORT)),
            log_level=Settings.LOG_LEVEL,
        )
    ).serve()
