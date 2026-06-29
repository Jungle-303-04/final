from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from settings import (
    COLLECT_INTERVAL_ENV,
    DEFAULT_COLLECT_INTERVAL_SECONDS,
    DEFAULT_KUBERNETES_SERVICE_HOST,
    DEFAULT_KUBERNETES_SERVICE_PORT,
    DEFAULT_NODE_NAME,
    DEFAULT_POD_NAME,
    DEFAULT_POD_NAMESPACE,
    DEFAULT_SERVICE_PORT,
    KUBERNETES_API_TIMEOUT_SECONDS,
    KUBERNETES_SERVICE_HOST_ENV,
    KUBERNETES_SERVICE_PORT_ENV,
    KUBERNETES_SERVICEACCOUNT_CA_CERT_PATH,
    KUBERNETES_SERVICEACCOUNT_TOKEN_PATH,
    LOG_LEVEL,
    METRIC_CONTENT_TYPE,
    NODE_NAME_ENV,
    POD_NAME_ENV,
    POD_NAMESPACE_ENV,
    RUNTIME_NAME,
    SAMPLE_CPU_USAGE_RATIO,
    SAMPLE_FILESYSTEM_USAGE_RATIO,
    SAMPLE_MEMORY_WORKING_SET_BYTES,
    SERVICE_HOST,
    SERVICE_NAME,
    SERVICE_PORT_ENV,
)
from uvicorn import Config, Server

from packages.config.settings import env


@dataclass(frozen=True)
class NodeRuntimeSample:
    node_name: str
    pod_name: str
    namespace: str
    timestamp: str
    cpu_usage_ratio: float
    memory_working_set_bytes: int
    filesystem_usage_ratio: float
    runtime: str

    def to_payload(self) -> dict[str, object]:
        return asdict(self)


class NodeCollector:
    def __init__(
        self,
        node_name: str,
        pod_name: str,
        namespace: str,
        interval_seconds: int,
    ) -> None:
        self.node_name = node_name
        self.pod_name = pod_name
        self.namespace = namespace
        self.interval_seconds = interval_seconds

    @classmethod
    def from_env(cls) -> NodeCollector:
        return cls(
            node_name=env(NODE_NAME_ENV, DEFAULT_NODE_NAME),
            pod_name=env(POD_NAME_ENV, DEFAULT_POD_NAME),
            namespace=env(POD_NAMESPACE_ENV, DEFAULT_POD_NAMESPACE),
            interval_seconds=int(env(COLLECT_INTERVAL_ENV, DEFAULT_COLLECT_INTERVAL_SECONDS)),
        )

    # Build the in-cluster Kubernetes API server URL from env vars injected by Kubernetes.
    def kubernetes_api_base_url(self) -> str:
        host = env(KUBERNETES_SERVICE_HOST_ENV, DEFAULT_KUBERNETES_SERVICE_HOST)
        port = env(KUBERNETES_SERVICE_PORT_ENV, DEFAULT_KUBERNETES_SERVICE_PORT)
        return f"https://{host}:{port}" 

    # Read the mounted ServiceAccount token and use it as a Kubernetes API Bearer token.
    def kubernetes_auth_headers(self) -> dict[str, str]:
        token = Path(KUBERNETES_SERVICEACCOUNT_TOKEN_PATH).read_text(encoding="utf-8").strip()
        return {"Authorization": f"Bearer {token}"}

    # List Pods through the Kubernetes API using this Pod's ServiceAccount identity.
    async def list_pods(self) -> dict[str, object]:
        async with httpx.AsyncClient(
            timeout=KUBERNETES_API_TIMEOUT_SECONDS,
            verify=KUBERNETES_SERVICEACCOUNT_CA_CERT_PATH,
        ) as client:
            response = await client.get(
                f"{self.kubernetes_api_base_url()}/api/v1/pods",
                headers=self.kubernetes_auth_headers(),
            )
            response.raise_for_status()
            return response.json()

    async def snapshot(self) -> NodeRuntimeSample:
        # For now, this only proves the collector can reach the Kubernetes API.
        # The next step will turn the Pod list into node-level metrics.
        await self.list_pods()

        return NodeRuntimeSample(
            node_name=self.node_name,
            pod_name=self.pod_name,
            namespace=self.namespace,
            timestamp=datetime.now(UTC).isoformat(),
            cpu_usage_ratio=SAMPLE_CPU_USAGE_RATIO,
            memory_working_set_bytes=SAMPLE_MEMORY_WORKING_SET_BYTES,
            filesystem_usage_ratio=SAMPLE_FILESYSTEM_USAGE_RATIO,
            runtime=RUNTIME_NAME,
        )

    async def prometheus_metrics(self) -> str:
        sample = await self.snapshot()
        labels = f'node="{sample.node_name}",runtime="{sample.runtime}"'
        return "\n".join(
            [
                "# HELP node_collector_cpu_usage_ratio Node CPU usage ratio.",
                "# TYPE node_collector_cpu_usage_ratio gauge",
                f"node_collector_cpu_usage_ratio{{{labels}}} {sample.cpu_usage_ratio}",
                "# HELP node_collector_memory_working_set_bytes Node memory working set.",
                "# TYPE node_collector_memory_working_set_bytes gauge",
                (
                    f"node_collector_memory_working_set_bytes{{{labels}}} "
                    f"{sample.memory_working_set_bytes}"
                ),
                "# HELP node_collector_filesystem_usage_ratio Node filesystem usage ratio.",
                "# TYPE node_collector_filesystem_usage_ratio gauge",
                f"node_collector_filesystem_usage_ratio{{{labels}}} "
                f"{sample.filesystem_usage_ratio}",
                "",
            ]
        )

    async def log_forever(self) -> None: 
        while True: # background loop
            print(
                json.dumps(
                    {
                        "service": SERVICE_NAME,
                        "kind": "node_runtime_sample",
                        "sample": (await self.snapshot()).to_payload(),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
            await asyncio.sleep(self.interval_seconds)


def create_app(collector: NodeCollector | None = None) -> FastAPI:
    node_collector = collector or NodeCollector.from_env()
    app = FastAPI(title=SERVICE_NAME)

    @app.on_event("startup")
    async def startup() -> None:
        app.state.log_task = asyncio.create_task(node_collector.log_forever())

    @app.on_event("shutdown")
    async def shutdown() -> None:
        task = getattr(app.state, "log_task", None)
        if task:
            task.cancel()

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": SERVICE_NAME, "node": node_collector.node_name}

    @app.get("/snapshot")
    async def snapshot() -> dict[str, object]:
        return (await node_collector.snapshot()).to_payload()

    @app.get("/metrics", response_class=PlainTextResponse)
    async def metrics() -> PlainTextResponse:
        return PlainTextResponse(
            await node_collector.prometheus_metrics(),
            media_type=METRIC_CONTENT_TYPE,
        )

    return app


async def run() -> None:
    await Server(
        Config(
            create_app(),
            host=SERVICE_HOST,
            port=int(env(SERVICE_PORT_ENV, DEFAULT_SERVICE_PORT)),
            log_level=LOG_LEVEL,
        )
    ).serve()
