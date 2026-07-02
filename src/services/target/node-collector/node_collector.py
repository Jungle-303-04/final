from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from enum import StrEnum

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from kubernetes_api import KubernetesApiClient
from metric_collectors import (
    MetricCollector,
    PodMetricCollector,
    collector_status_metric_sample,
)
from prometheus_metrics import MetricSample, render_prometheus_metrics
from uvicorn import Config, Server

from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway

LOGGER = get_logger(__name__)


class Field(StrEnum):
    KIND = "kind"
    NODE = "node"
    SAMPLE = "sample"


NODE_RUNTIME_SAMPLE_KIND = "node_runtime_sample"
SNAPSHOT_PATH = "/snapshot"
METRICS_PATH = "/metrics"


class NodeCollectorConfig:
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

    def to_body(self) -> dict[str, object]:
        return asdict(self)


class NodeCollector:
    def __init__(
        self,
        node_name: str,
        pod_name: str,
        namespace: str,
        interval_seconds: int,
        kubernetes: KubernetesApiClient | None = None,
    ) -> None:
        self.node_name = node_name
        self.pod_name = pod_name
        self.namespace = namespace
        self.interval_seconds = interval_seconds
        self.kubernetes = kubernetes or KubernetesApiClient()
        self.collectors: tuple[MetricCollector, ...] = (
            PodMetricCollector(self.kubernetes, self.node_name),
        )

    @classmethod
    def from_env(cls) -> NodeCollector:
        return cls(
            node_name=env(NodeCollectorConfig.NODE_NAME_ENV, NodeCollectorConfig.DEFAULT_NODE_NAME),
            pod_name=env(NodeCollectorConfig.POD_NAME_ENV, NodeCollectorConfig.DEFAULT_POD_NAME),
            namespace=env(
                NodeCollectorConfig.POD_NAMESPACE_ENV, NodeCollectorConfig.DEFAULT_POD_NAMESPACE
            ),
            interval_seconds=int(
                env(
                    NodeCollectorConfig.COLLECT_INTERVAL_ENV,
                    NodeCollectorConfig.DEFAULT_COLLECT_INTERVAL_SECONDS,
                )
            ),
        )

    def snapshot(self) -> NodeRuntimeSample:
        return NodeRuntimeSample(
            node_name=self.node_name,
            pod_name=self.pod_name,
            namespace=self.namespace,
            timestamp=datetime.now(UTC).isoformat(),
            cpu_usage_ratio=NodeCollectorConfig.SAMPLE_CPU_USAGE_RATIO,
            memory_working_set_bytes=NodeCollectorConfig.SAMPLE_MEMORY_WORKING_SET_BYTES,
            filesystem_usage_ratio=NodeCollectorConfig.SAMPLE_FILESYSTEM_USAGE_RATIO,
            runtime=NodeCollectorConfig.RUNTIME_NAME,
        )

    async def prometheus_metrics(self) -> str:
        sample = self.snapshot()
        metric_labels = {"node": sample.node_name, "runtime": sample.runtime}
        metrics = [
            MetricSample(
                name="node_collector_cpu_usage_ratio",
                help="Node CPU usage ratio.",
                value=sample.cpu_usage_ratio,
                labels=metric_labels,
            ),
            MetricSample(
                name="node_collector_memory_working_set_bytes",
                help="Node memory working set.",
                value=sample.memory_working_set_bytes,
                labels=metric_labels,
            ),
            MetricSample(
                name="node_collector_filesystem_usage_ratio",
                help="Node filesystem usage ratio.",
                value=sample.filesystem_usage_ratio,
                labels=metric_labels,
            ),
        ]

        for collector in self.collectors:
            try:
                metrics.extend(await collector.collect(metric_labels))
                metrics.append(
                    collector_status_metric_sample(
                        metric_labels,
                        collector.collector_name,
                        has_error=False,
                    )
                )
            except Exception as exc:
                LOGGER.warning(
                    "node_metric_collector_failed",
                    extra={
                        CONTEXT_KEY: {
                            Gateway.SERVICE: NodeCollectorConfig.SERVICE_NAME,
                            "collector": collector.collector_name,
                            "exception_type": type(exc).__name__,
                        }
                    },
                )
                metrics.append(
                    collector_status_metric_sample(
                        metric_labels,
                        collector.collector_name,
                        has_error=True,
                    )
                )

        return render_prometheus_metrics(metrics)

    async def log_forever(self) -> None:
        while True:
            LOGGER.info(
                "node_runtime_sample_collected",
                extra={
                    CONTEXT_KEY: {
                        Gateway.SERVICE: NodeCollectorConfig.SERVICE_NAME,
                        Field.KIND: NODE_RUNTIME_SAMPLE_KIND,
                        Field.SAMPLE: self.snapshot().to_body(),
                    }
                },
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

    app = FastAPI(title=NodeCollectorConfig.SERVICE_NAME, lifespan=lifespan)

    @app.get(gateway_routes.HEALTHZ_PATH)
    async def healthz() -> dict[str, str]:
        return {
            Gateway.STATUS: Gateway.STATUS_OK,
            Gateway.SERVICE: NodeCollectorConfig.SERVICE_NAME,
            Field.NODE: node_collector.node_name,
        }

    @app.get(SNAPSHOT_PATH)
    async def snapshot() -> dict[str, object]:
        return node_collector.snapshot().to_body()

    @app.get(METRICS_PATH, response_class=PlainTextResponse)
    async def metrics() -> PlainTextResponse:
        return PlainTextResponse(
            await node_collector.prometheus_metrics(),
            media_type=NodeCollectorConfig.METRIC_CONTENT_TYPE,
        )

    return app


async def run() -> None:
    await Server(
        Config(
            create_app(),
            host=NodeCollectorConfig.SERVICE_HOST,
            port=int(
                env(NodeCollectorConfig.SERVICE_PORT_ENV, NodeCollectorConfig.DEFAULT_SERVICE_PORT)
            ),
            log_level=NodeCollectorConfig.LOG_LEVEL,
        )
    ).serve()
