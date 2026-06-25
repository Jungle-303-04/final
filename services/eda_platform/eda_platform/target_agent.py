from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
from fastapi import FastAPI
from uvicorn import Config, Server

from eda_platform.core import env


class TargetClusterAgent:
    def __init__(self) -> None:
        self.base_url = env("MANAGEMENT_BASE_URL", "http://localhost:18080").rstrip("/")
        self.cluster_id = env("TARGET_CLUSTER_ID", "target-cluster-01")
        self.interval = int(env("EVIDENCE_INTERVAL_SECONDS", "10"))

    async def run(self) -> None:
        async with httpx.AsyncClient(timeout=20) as client:
            await self.register(client)
            await asyncio.gather(self.ship_evidence(client), self.poll_commands(client))

    async def register(self, client: httpx.AsyncClient) -> None:
        while True:
            try:
                await client.post(
                    f"{self.base_url}/agent/connect",
                    json={
                        "cluster_id": self.cluster_id,
                        "agent_id": env("HOSTNAME", "target-agent"),
                        "capabilities": ["collector", "command_receiver"],
                    },
                )
                return
            except Exception as exc:
                print(f"agent waiting for management gateway: {exc}", flush=True)
                await asyncio.sleep(3)

    async def ship_evidence(self, client: httpx.AsyncClient) -> None:
        while True:
            try:
                response = await client.post(f"{self.base_url}/agent/evidence", json=self.fake_evidence())
                print(f"evidence shipped status={response.status_code}", flush=True)
            except Exception as exc:
                print(f"evidence ship failed: {exc}", flush=True)
            await asyncio.sleep(self.interval)

    async def poll_commands(self, client: httpx.AsyncClient) -> None:
        while True:
            try:
                response = await client.get(
                    f"{self.base_url}/agent/commands/poll",
                    params={"cluster_id": self.cluster_id, "timeout": 15},
                )
                response.raise_for_status()
                command = response.json().get("command")
                if command:
                    print(f"agent executing command {command['command_id']} action={command['action']}", flush=True)
                    await asyncio.sleep(2)
                    await client.post(
                        f"{self.base_url}/agent/commands/{command['command_id']}/result",
                        json={
                            "status": "completed",
                            "cluster_id": self.cluster_id,
                            "applied": True,
                            "message": "fake Kubernetes action applied in sandbox namespace",
                        },
                    )
            except Exception as exc:
                print(f"command polling failed: {exc}", flush=True)
                await asyncio.sleep(3)

    def fake_evidence(self) -> dict[str, Any]:
        return {
            "cluster_id": self.cluster_id,
            "kubernetes": {
                "pods": [{"name": "checkout-api-7f8d", "status": "CrashLoopBackOff", "restarts": 4}],
                "events": ["readiness probe failed", "back-off restarting failed container"],
            },
            "metrics": {"source": "fake-prometheus", "cpu": 0.83, "memory_mb": 512, "http_5xx_rate": 0.19},
            "logs": [
                {"source": "fake-loki", "line": "ERROR readiness check failed: downstream timeout"},
                {"source": "fake-loki", "line": "WARN rollback candidate detected"},
            ],
            "traces": {"source": "fake-otel", "slow_span": "GET /checkout"},
        }


def create_fake_telemetry_app(kind: str) -> FastAPI:
    app = FastAPI(title=f"fake-{kind}")

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": f"fake-{kind}"}

    @app.get("/{path:path}")
    async def catch_all(path: str) -> dict[str, Any]:
        if kind == "prometheus":
            return {"status": "success", "data": {"resultType": "vector", "result": [{"metric": {"pod": "checkout-api"}, "value": [time.time(), "0.19"]}]}}
        if kind == "loki":
            return {"status": "success", "data": {"result": [{"stream": {"pod": "checkout-api"}, "values": [[str(int(time.time() * 1e9)), "ERROR readiness check failed"]]}]}}
        return {"status": "ok", "telemetry": "fake-otel", "path": path}

    return app


async def run_fake_telemetry(kind: str) -> None:
    await Server(Config(create_fake_telemetry_app(kind), host="0.0.0.0", port=int(env("PORT", "8000")), log_level="info")).serve()


async def run_node_collector() -> None:
    while True:
        print("fake node collector scraped node/log/runtime metrics", flush=True)
        await asyncio.sleep(15)

