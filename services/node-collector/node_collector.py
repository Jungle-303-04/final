from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from kubernetes_api import KubernetesApiClient, count_not_ready_pods, pods_on_node
from prometheus_metrics import MetricSample, render_prometheus_metrics
from settings import (
    COLLECT_INTERVAL_ENV,
    DEFAULT_COLLECT_INTERVAL_SECONDS,
    DEFAULT_NODE_NAME,
    DEFAULT_POD_NAME,
    DEFAULT_POD_NAMESPACE,
    DEFAULT_SERVICE_PORT,
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
    # One internal snapshot used by /snapshot, structured logs, and /metrics.
    node_name: str
    pod_name: str
    namespace: str
    timestamp: str
    runtime: str

    # These are still demo runtime samples.
    cpu_usage_ratio: float
    memory_working_set_bytes: int
    filesystem_usage_ratio: float

    # These are calculated from the Kubernetes API response.
    node_pod_count: int
    node_not_ready_pod_count: int

    def to_payload(self) -> dict[str, object]:
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

    @classmethod
    def from_env(cls) -> NodeCollector:
        return cls(
            node_name=env(NODE_NAME_ENV, DEFAULT_NODE_NAME),
            pod_name=env(POD_NAME_ENV, DEFAULT_POD_NAME),
            namespace=env(POD_NAMESPACE_ENV, DEFAULT_POD_NAMESPACE),
            interval_seconds=int(env(COLLECT_INTERVAL_ENV, DEFAULT_COLLECT_INTERVAL_SECONDS)),
        )

    async def snapshot(self) -> NodeRuntimeSample:
        # Fetch all Pods, then reduce them to metrics for this collector's node.
        pods_payload = await self.kubernetes.list_pods()
        node_pods = pods_on_node(pods_payload, self.node_name)

        return NodeRuntimeSample(
            node_name=self.node_name,
            pod_name=self.pod_name,
            namespace=self.namespace,
            timestamp=datetime.now(UTC).isoformat(),
            cpu_usage_ratio=SAMPLE_CPU_USAGE_RATIO,
            memory_working_set_bytes=SAMPLE_MEMORY_WORKING_SET_BYTES,
            filesystem_usage_ratio=SAMPLE_FILESYSTEM_USAGE_RATIO,
            runtime=RUNTIME_NAME,
            node_pod_count=len(node_pods),
            node_not_ready_pod_count=count_not_ready_pods(node_pods),
        )

    def metric_samples(self, sample: NodeRuntimeSample) -> list[MetricSample]:
        # These labels identify which node produced the sample.
        # In a multi-node cluster, each DaemonSet Pod will produce the same metric names
        # with a different node label, and Prometheus can group by node.
        labels = {
            "node": sample.node_name,
            "runtime": sample.runtime,
        }

        return [
            MetricSample(
                name="node_collector_cpu_usage_ratio",
                help="Node CPU usage ratio.",
                value=sample.cpu_usage_ratio,
                labels=labels,
            ),
            MetricSample(
                name="node_collector_memory_working_set_bytes",
                help="Node memory working set.",
                value=sample.memory_working_set_bytes,
                labels=labels,
            ),
            MetricSample(
                name="node_collector_filesystem_usage_ratio",
                help="Node filesystem usage ratio.",
                value=sample.filesystem_usage_ratio,
                labels=labels,
            ),
            MetricSample(
                name="node_collector_node_pod_count",
                help="Pods scheduled on this Kubernetes node.",
                value=sample.node_pod_count,
                labels=labels,
            ),
            MetricSample(
                name="node_collector_node_not_ready_pod_count",
                help="Pods scheduled on this Kubernetes node that are not Ready.",
                value=sample.node_not_ready_pod_count,
                labels=labels,
            ),
        ]

    async def prometheus_metrics(self) -> str:
        sample = await self.snapshot()
        return render_prometheus_metrics(self.metric_samples(sample))

    async def log_forever(self) -> None:
        while True:
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
