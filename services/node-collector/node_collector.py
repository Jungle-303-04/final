from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from kubernetes_api import KubernetesApiClient, count_not_ready_pods, pods_on_node
from metric_definitions import (
    COLLECTOR_STATUS_METRIC_DEFINITIONS,
    POD_METRIC_DEFINITIONS,
    FieldMetricDefinition,
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
class PodSummary:
    # Kubernetes Pod data reduced to the node-scoped values this collector owns.
    pod_count: int
    not_ready_pod_count: int


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

    @classmethod
    def from_env(cls) -> NodeCollector:
        return cls(
            node_name=env(NODE_NAME_ENV, DEFAULT_NODE_NAME),
            pod_name=env(POD_NAME_ENV, DEFAULT_POD_NAME),
            namespace=env(POD_NAMESPACE_ENV, DEFAULT_POD_NAMESPACE),
            interval_seconds=int(env(COLLECT_INTERVAL_ENV, DEFAULT_COLLECT_INTERVAL_SECONDS)),
        )

    async def snapshot(self) -> NodeRuntimeSample:
        # Build one collector snapshot. Individual Kubernetes summaries stay in helpers
        # so adding more metric groups does not turn this method into a long script.
        try:
            # This is the collection step. More Kubernetes-backed summaries can be added
            # here without changing the Prometheus rendering code below.
            pod_summary = await self.collect_pod_summary()
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

    async def collect_pod_summary(self) -> PodSummary:
        # Fetch all Pods, then reduce them to values for this collector's node.
        pods_payload = await self.kubernetes.list_pods()
        node_pods = pods_on_node(pods_payload, self.node_name)
        return PodSummary(
            pod_count=len(node_pods),
            not_ready_pod_count=count_not_ready_pods(node_pods),
        )

    def metric_samples(self, sample: NodeRuntimeSample) -> list[MetricSample]:
        # These labels identify which node produced the sample.
        # In a multi-node cluster, each DaemonSet Pod will produce the same metric names
        # with a different node label, and Prometheus can group by node.
        labels = {
            "node": sample.node_name,
            "runtime": sample.runtime,
        }

        samples = self.field_metric_samples(
            sample,
            labels,
            COLLECTOR_STATUS_METRIC_DEFINITIONS,
        )
        samples.extend(self.pod_metric_samples(sample, labels))
        return samples

    def field_metric_samples(
        self,
        sample: NodeRuntimeSample,
        labels: dict[str, str],
        definitions: tuple[FieldMetricDefinition, ...],
    ) -> list[MetricSample]:
        # Convert declarative metric definitions plus one collected sample into
        # concrete MetricSample objects that prometheus_metrics.py can render.
        samples = []
        for definition in definitions:
            value = getattr(sample, definition.sample_field)
            # Unknown values are omitted instead of exporting fake numbers.
            if value is None:
                continue
            # Prometheus sample values are numeric, so booleans become 1 or 0.
            if isinstance(value, bool):
                value = int(value)

            samples.append(
                MetricSample(
                    name=definition.name,
                    help=definition.help,
                    value=value,
                    labels=labels,
                    type=definition.type,
                )
            )

        return samples

    def pod_metric_samples(
        self,
        sample: NodeRuntimeSample,
        labels: dict[str, str],
    ) -> list[MetricSample]:
        return self.field_metric_samples(sample, labels, POD_METRIC_DEFINITIONS)

    async def prometheus_metrics(self) -> str:
        # Prometheus pulls text from /metrics; this method bridges collection to text output.
        sample = await self.snapshot()
        return render_prometheus_metrics(self.metric_samples(sample))

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
