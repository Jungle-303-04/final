from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from uvicorn import Config, Server

from packages.shared.core import env

SERVICE_NAME = "node-collector"
SERVICE_HOST = "0.0.0.0"
SERVICE_PORT_ENV = "PORT"
DEFAULT_SERVICE_PORT = "9100"
LOG_LEVEL = "info"
NODE_NAME_ENV = "NODE_NAME"
POD_NAME_ENV = "POD_NAME"
POD_NAMESPACE_ENV = "POD_NAMESPACE"
COLLECT_INTERVAL_ENV = "COLLECT_INTERVAL_SECONDS"
DEFAULT_NODE_NAME = "unknown-node"
DEFAULT_POD_NAME = "node-collector"
DEFAULT_POD_NAMESPACE = "target"
DEFAULT_COLLECT_INTERVAL_SECONDS = "15"
SAMPLE_CPU_USAGE_RATIO = 0.37
SAMPLE_MEMORY_WORKING_SET_BYTES = 268_435_456
SAMPLE_FILESYSTEM_USAGE_RATIO = 0.42
RUNTIME_NAME = "containerd"
METRIC_CONTENT_TYPE = "text/plain; version=0.0.4"


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

    def snapshot(self) -> NodeRuntimeSample:
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

    def prometheus_metrics(self) -> str:
        sample = self.snapshot()
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
        while True:
            print(
                json.dumps(
                    {
                        "service": SERVICE_NAME,
                        "kind": "node_runtime_sample",
                        "sample": self.snapshot().to_payload(),
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
        return node_collector.snapshot().to_payload()

    @app.get("/metrics", response_class=PlainTextResponse)
    async def metrics() -> PlainTextResponse:
        return PlainTextResponse(
            node_collector.prometheus_metrics(),
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
