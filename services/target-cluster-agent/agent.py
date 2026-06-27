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
    DEFAULT_PROMETHEUS_BASE_URL,
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
    PROMETHEUS_BASE_URL_ENV,
    PROMETHEUS_TIMEOUT_SECONDS,
    PROMETHEUS_VECTOR_VALUE,
    REGISTER_RETRY_DELAY_SECONDS,
    SERVICE_HOST,
    SERVICE_PORT_ENV,
    TARGET_CLUSTER_ID_ENV,
)
from telemetry_queries import PROMETHEUS_INSTANT_QUERIES
from uvicorn import Config, Server

from packages.config.constants import DEFAULT_EVIDENCE_INTERVAL_SECONDS, DEFAULT_TARGET_CLUSTER_ID
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.interfaces import CommandRecord, ManagementPlaneClient


class HttpManagementPlaneClient:
    # Configure one reusable async HTTP client for Management Plane requests.
    def __init__(self, base_url: str, timeout_seconds: int = HTTP_TIMEOUT_SECONDS) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=timeout_seconds)

    # Allow this client to be used with "async with".
    async def __aenter__(self) -> HttpManagementPlaneClient:
        return self

    # Close the underlying HTTP client when the "async with" block exits.
    async def __aexit__(self, *_exc: object) -> None:
        await self.close()

    # Release network resources held by the async HTTP client.
    async def close(self) -> None:
        await self.client.aclose()

    # Tell the Management Plane that this target-cluster agent is online.
    async def register_agent(self, cluster_id: str, agent_id: str, capabilities: list[str]) -> None:
        await self.client.post(
            f"{self.base_url}/agent/connect",
            json={
                "cluster_id": cluster_id,
                "agent_id": agent_id,
                "capabilities": capabilities,
            },
        )

    # Send one evidence payload to the Management Plane.
    async def ship_evidence(self, evidence: JsonObject) -> int:
        response = await self.client.post(f"{self.base_url}/agent/evidence", json=evidence)
        return response.status_code

    # Ask the Management Plane for one pending command.
    async def poll_command(self, cluster_id: str, timeout_seconds: int) -> CommandRecord | None:
        response = await self.client.get(
            f"{self.base_url}/agent/commands/poll",
            params={"cluster_id": cluster_id, "timeout": timeout_seconds},
        )
        response.raise_for_status()
        return response.json().get("command")

    # Report one command execution result back to the Management Plane.
    async def complete_command(self, command_id: str, result: JsonObject) -> None:
        await self.client.post(f"{self.base_url}/agent/commands/{command_id}/result", json=result)


class TargetClusterAgent:
    # Read runtime settings and optionally accept a test/mock Management Plane client.
    def __init__(self, client: ManagementPlaneClient | None = None) -> None:
        self.base_url = env(MANAGEMENT_BASE_URL_ENV, DEFAULT_MANAGEMENT_BASE_URL).rstrip("/")
        self.prometheus_base_url = env(PROMETHEUS_BASE_URL_ENV, DEFAULT_PROMETHEUS_BASE_URL).rstrip("/")
        self.cluster_id = env(TARGET_CLUSTER_ID_ENV, DEFAULT_TARGET_CLUSTER_ID)
        self.interval = int(env(EVIDENCE_INTERVAL_ENV, DEFAULT_EVIDENCE_INTERVAL_SECONDS))
        self.client = client

    # Start the agent with either the injected client or a real HTTP client.
    async def run(self) -> None:
        if self.client is not None:
            await self.run_with_client(self.client)
            return
        async with HttpManagementPlaneClient(self.base_url) as client:
            await self.run_with_client(client)

    # Register once, then run evidence shipping and command polling together.
    async def run_with_client(self, client: ManagementPlaneClient) -> None:
        await self.register(client)
        await asyncio.gather(self.ship_evidence(client), self.poll_commands(client))

    # Retry registration until the Management Plane accepts this agent.
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

    # Periodically collect evidence and send it through the Management Plane client.
    async def ship_evidence(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                status_code = await client.ship_evidence(await self.collect_evidence())
                print(f"evidence shipped status={status_code}", flush=True)
            except Exception as exc:
                print(f"evidence ship failed: {exc}", flush=True)
            await asyncio.sleep(self.interval)

    # TODO : NOT yet : collect_evidence
    # Build the full evidence payload; metrics are replaced with Prometheus data.
    async def collect_evidence(self) -> JsonObject:
        evidence = self.fake_evidence()
        evidence["metrics"] = await self.collect_prometheus_metrics()
        return evidence

    # Run every configured Prometheus query and package the normalized results.
    async def collect_prometheus_metrics(self) -> JsonObject:
        """Collect configured Prometheus query results."""
        try:
            async with httpx.AsyncClient(timeout=PROMETHEUS_TIMEOUT_SECONDS) as client:
                query_results = {}

                for metric_name, query in PROMETHEUS_INSTANT_QUERIES.items():
                    payload = await self.query_prometheus(client, query)

                    query_results[metric_name] = {
                        "query": query,
                        # ** is the dictionary unpacking syntax.
                        **self.normalize_prometheus_payload(payload),
                    }

            return {
                "source": "prometheus",
                "results": query_results,
            }

        except Exception as exc:
            print(f"prometheus metrics collection failed: {exc}", flush=True)
            return self.fake_evidence()["metrics"]
        
    # Actually requesting a single query to Prometheus and return the parsed response body.
    async def query_prometheus(self, client: httpx.AsyncClient, query: str) -> JsonObject:
        response = await client.get(
            f"{self.prometheus_base_url}/api/v1/query",
            params={"query": query},
        )
        response.raise_for_status()
        return response.json()
    
    # Convert Prometheus response shapes into a stable evidence-friendly structure.
    def normalize_prometheus_payload(self, payload: JsonObject) -> JsonObject:
        data = payload.get("data", {})
        result_type = data.get("resultType")
        result = data.get("result", [])

        if result_type == "vector":
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

        return {
            "result_type": result_type,
            "result": result,
            "raw": payload,
        }

    # Keep checking for commands and report completed command results.
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

    # Return demo evidence used as the baseline and as fallback data.
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


# Create a fake telemetry FastAPI app for Prometheus, Loki, or OTel demos.
def create_fake_telemetry_app(kind: str) -> FastAPI:
    app = FastAPI(title=f"fake-{kind}")

    # Provide a simple health endpoint for fake telemetry services.
    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": f"fake-{kind}"}

    # Return fake telemetry data for any requested path.
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


# Run one fake telemetry service with uvicorn.
async def run_fake_telemetry(kind: str) -> None:
    await Server(
        Config(
            create_fake_telemetry_app(kind),
            host=SERVICE_HOST,
            port=int(env(SERVICE_PORT_ENV, DEFAULT_SERVICE_PORT)),
            log_level=LOG_LEVEL,
        )
    ).serve()
