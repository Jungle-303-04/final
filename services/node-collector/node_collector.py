from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from kubernetes_api import KubernetesApiClient
from metric_collectors import (
    MetricCollector,
    PodMetricCollector,
    collector_status_metric_sample,
)
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

    # These are calculated from the Kubernetes API response.
    node_pod_count: int | None
    node_not_ready_pod_count: int | None

    # Keep /metrics available even when the Kubernetes API read fails.
    scrape_error: bool
    scrape_error_message: str | None

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
        self.pod_metric_collector = PodMetricCollector(self.kubernetes, self.node_name)
        self.metric_collectors: list[MetricCollector] = [self.pod_metric_collector]

    @classmethod
    def from_env(cls) -> NodeCollector:
        return cls(
            node_name=env(NODE_NAME_ENV, DEFAULT_NODE_NAME),
            pod_name=env(POD_NAME_ENV, DEFAULT_POD_NAME),
            namespace=env(POD_NAMESPACE_ENV, DEFAULT_POD_NAMESPACE),
            interval_seconds=int(env(COLLECT_INTERVAL_ENV, DEFAULT_COLLECT_INTERVAL_SECONDS)),
        )

    async def snapshot(self) -> NodeRuntimeSample:
        # Build a human/log-friendly snapshot. Prometheus metrics are collected separately
        # by metric group collectors so this method does not control every metric shape.
        try:
            pod_summary = await self.pod_metric_collector.collect_pod_summary()
            node_pod_count = pod_summary.pod_count
            node_not_ready_pod_count = pod_summary.not_ready_pod_count
            scrape_error = False
            scrape_error_message = None

        except Exception as exc:
            node_pod_count = None
            node_not_ready_pod_count = None
            scrape_error = True
            scrape_error_message = str(exc)

        return NodeRuntimeSample(
            node_name=self.node_name,
            pod_name=self.pod_name,
            namespace=self.namespace,
            timestamp=datetime.now(UTC).isoformat(),
            runtime=RUNTIME_NAME,
            node_pod_count=node_pod_count,
            node_not_ready_pod_count=node_not_ready_pod_count,
            scrape_error=scrape_error,
            scrape_error_message=scrape_error_message,
        )

    def metric_labels(self) -> dict[str, str]:
        # These labels identify which node produced each metric sample.
        # In a multi-node cluster, each DaemonSet Pod will produce the same metric names
        # with a different node label, and Prometheus can group by node.
        return {
            "node": self.node_name,
            "runtime": RUNTIME_NAME,
        }

    async def metric_samples(self) -> list[MetricSample]:
        # Run each metric group collector and keep /metrics alive if one group fails.
        labels = self.metric_labels()
        samples = []
        has_error = False
        for collector in self.metric_collectors:
            try:
                samples.extend(await collector.collect(labels))
            except Exception as exc:
                has_error = True
                print(f"node metric collection failed: {exc}", flush=True)

        samples.insert(0, collector_status_metric_sample(labels, has_error))
        return samples

    async def prometheus_metrics(self) -> str:
        # Prometheus pulls text from /metrics; this method bridges collection to text output.
        return render_prometheus_metrics(await self.metric_samples())

    async def log_forever(self) -> None:
        # The same snapshot is also written as structured stdout for Loki/Alloy.
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
