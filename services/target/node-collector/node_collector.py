from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from enum import StrEnum

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from settings import Settings
from uvicorn import Config, Server

from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway


class Field(StrEnum):
    KIND = "kind"
    NODE = "node"
    SAMPLE = "sample"


NODE_RUNTIME_SAMPLE_KIND = "node_runtime_sample"
SNAPSHOT_PATH = "/snapshot"
METRICS_PATH = "/metrics"


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

    def to_body(self) -> dict[str, object]:
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
            node_name=env(Settings.NODE_NAME_ENV, Settings.DEFAULT_NODE_NAME),
            pod_name=env(Settings.POD_NAME_ENV, Settings.DEFAULT_POD_NAME),
            namespace=env(Settings.POD_NAMESPACE_ENV, Settings.DEFAULT_POD_NAMESPACE),
            interval_seconds=int(
                env(
                    Settings.COLLECT_INTERVAL_ENV,
                    Settings.DEFAULT_COLLECT_INTERVAL_SECONDS,
                )
            ),
        )

    def snapshot(self) -> NodeRuntimeSample:
        return NodeRuntimeSample(
            node_name=self.node_name,
            pod_name=self.pod_name,
            namespace=self.namespace,
            timestamp=datetime.now(UTC).isoformat(),
            cpu_usage_ratio=Settings.SAMPLE_CPU_USAGE_RATIO,
            memory_working_set_bytes=Settings.SAMPLE_MEMORY_WORKING_SET_BYTES,
            filesystem_usage_ratio=Settings.SAMPLE_FILESYSTEM_USAGE_RATIO,
            runtime=Settings.RUNTIME_NAME,
        )

    def prometheus_metrics(self) -> str:
        sample = self.snapshot()
        labels = f'node="{sample.node_name}",runtime="{sample.runtime}"'
        return "\n".join(
            [
                "# HELP node_collector_cpu_usage_ratio Node CPU usage ratio.",
                "# TYPE node_collector_cpu_usage_ratio gauge",
                (f"node_collector_cpu_usage_ratio{{{labels}}} {sample.cpu_usage_ratio}"),
                ("# HELP node_collector_memory_working_set_bytes Node memory working set."),
                "# TYPE node_collector_memory_working_set_bytes gauge",
                (f"node_collector_memory_working_set_bytes{{{labels}}} {sample.memory_working_set_bytes}"),
                ("# HELP node_collector_filesystem_usage_ratio Node filesystem usage ratio."),
                "# TYPE node_collector_filesystem_usage_ratio gauge",
                f"node_collector_filesystem_usage_ratio{{{labels}}} {sample.filesystem_usage_ratio}",
                "",
            ]
        )

    async def log_forever(self) -> None:
        while True:
            print(
                json.dumps(
                    {
                        Gateway.SERVICE: Settings.SERVICE_NAME,
                        Field.KIND: NODE_RUNTIME_SAMPLE_KIND,
                        Field.SAMPLE: self.snapshot().to_body(),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
            await asyncio.sleep(self.interval_seconds)


def create_app(collector: NodeCollector | None = None) -> FastAPI:
    node_collector = collector or NodeCollector.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.log_task = asyncio.create_task(node_collector.log_forever())
        try:
            yield
        finally:
            task = getattr(app.state, "log_task", None)
            if task:
                task.cancel()

    app = FastAPI(title=Settings.SERVICE_NAME, lifespan=lifespan)

    @app.get(gateway_routes.HEALTHZ_PATH)
    async def healthz() -> dict[str, str]:
        return {
            Gateway.STATUS: Gateway.STATUS_OK,
            Gateway.SERVICE: Settings.SERVICE_NAME,
            Field.NODE: node_collector.node_name,
        }

    @app.get(SNAPSHOT_PATH)
    async def snapshot() -> dict[str, object]:
        return node_collector.snapshot().to_body()

    @app.get(METRICS_PATH, response_class=PlainTextResponse)
    async def metrics() -> PlainTextResponse:
        return PlainTextResponse(
            node_collector.prometheus_metrics(),
            media_type=Settings.METRIC_CONTENT_TYPE,
        )

    return app


async def run() -> None:
    await Server(
        Config(
            create_app(),
            host=Settings.SERVICE_HOST,
            port=int(env(Settings.SERVICE_PORT_ENV, Settings.DEFAULT_SERVICE_PORT)),
            log_level=Settings.LOG_LEVEL,
        )
    ).serve()
