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
    # One internal snapshot used by /snapshot and structured logs.
    # Prometheus /metrics is built separately by metric group collectors.
    node_name: str
    pod_name: str
    namespace: str
    timestamp: str
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
        kubernetes: KubernetesApiClient | None = None,
    ) -> None:
        self.node_name = node_name
        self.pod_name = pod_name
        self.namespace = namespace
        self.interval_seconds = interval_seconds
        self.kubernetes = kubernetes or KubernetesApiClient()
        # from metric_collectors.py
        # Inject fields needed to run PodMetricCollector.
        self.pod_metric_collector = PodMetricCollector(self.kubernetes, self.node_name)
        # Register actually running collectors.
        self.metric_collectors: list[MetricCollector] = [self.pod_metric_collector]

    @classmethod
    def from_env(cls) -> NodeCollector:
        return cls(
            node_name=env(NODE_NAME_ENV, DEFAULT_NODE_NAME),
            pod_name=env(POD_NAME_ENV, DEFAULT_POD_NAME),
            namespace=env(POD_NAMESPACE_ENV, DEFAULT_POD_NAMESPACE),
            interval_seconds=int(env(COLLECT_INTERVAL_ENV, DEFAULT_COLLECT_INTERVAL_SECONDS)),
        )

    ## for Loki-log
    async def snapshot(self) -> NodeRuntimeSample:
        # Build a human/log-friendly snapshot for the collector process itself.
        # Kubernetes metric values and scrape errors belong to /metrics collectors.
        return NodeRuntimeSample(
            node_name=self.node_name,
            pod_name=self.pod_name,
            namespace=self.namespace,
            timestamp=datetime.now(UTC).isoformat(),
            runtime=RUNTIME_NAME,
        )

    async def log_forever(self) -> None:
        # The same snapshot is also written as structured stdout for Loki.
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

    ## for Prometheus-metrics
    def metric_labels(self) -> dict[str, str]:
        # Build common labels attached to every metric.
        return {
            "node": self.node_name,
            "runtime": RUNTIME_NAME,
        }

    async def metric_samples(self) -> list[MetricSample]:
        # Run each metric group collector and keep /metrics alive if one group fails.
        labels = self.metric_labels()
        samples: list[MetricSample] = []
        status_samples: list[MetricSample] = []
        for collector in self.metric_collectors:
            has_error = False
            try:
                samples.extend(await collector.collect(labels))
            except Exception as exc:
                has_error = True
                print(
                    f"node metric collection failed collector={collector.collector_name}: {exc}",
                    flush=True,
                )
            status_samples.append(
                collector_status_metric_sample(labels, collector.collector_name, has_error)
            )

        return status_samples + samples

    async def prometheus_metrics(self) -> str:
        # Prometheus pulls text from /metrics; this method bridges collection to text output.
        return render_prometheus_metrics(await self.metric_samples())


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
