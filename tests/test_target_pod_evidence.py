from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
NODE_COLLECTOR_PATH = (
    ROOT_DIR / "src" / "services" / "target" / "node-collector" / "metric_collectors.py"
)
KUBERNETES_API_PATH = NODE_COLLECTOR_PATH.with_name("kubernetes_api.py")


def load_metric_collectors_module():
    spec = importlib.util.spec_from_file_location(
        "test_target_pod_evidence_module",
        NODE_COLLECTOR_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {NODE_COLLECTOR_PATH}")

    module = importlib.util.module_from_spec(spec)
    sys.modules["test_target_pod_evidence_module"] = module
    previous_modules = {
        name: sys.modules.pop(name, None)
        for name in ("config", "kubernetes_api", "prometheus_metrics")
    }
    sys.path.insert(0, str(NODE_COLLECTOR_PATH.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(NODE_COLLECTOR_PATH.parent))
        for name in ("config", "kubernetes_api", "prometheus_metrics"):
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


def load_kubernetes_api_module():
    spec = importlib.util.spec_from_file_location(
        "test_target_node_kubernetes_api_module",
        KUBERNETES_API_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {KUBERNETES_API_PATH}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class StubKubernetesApi:
    def __init__(self) -> None:
        self.requested_nodes: list[str] = []

    async def list_pods_on_node(self, node_name: str) -> dict[str, object]:
        self.requested_nodes.append(node_name)
        return {
            "items": [
                {
                    "spec": {"nodeName": "target-control-plane"},
                    "status": {"conditions": [{"type": "Ready", "status": "True"}]},
                },
                {
                    "spec": {"nodeName": "target-control-plane"},
                    "status": {"conditions": [{"type": "Ready", "status": "False"}]},
                },
                {
                    "spec": {"nodeName": "other-node"},
                    "status": {"conditions": [{"type": "Ready", "status": "False"}]},
                },
            ]
        }


def test_pod_metric_collector_builds_node_scoped_pod_evidence() -> None:
    module = load_metric_collectors_module()
    kubernetes = StubKubernetesApi()
    collector = module.PodMetricCollector(kubernetes, "target-control-plane")

    samples = asyncio.run(
        collector.collect({"node": "target-control-plane", "runtime": "containerd"})
    )

    by_name = {sample.name: sample for sample in samples}

    assert collector.collector_name == "pod"
    assert by_name["node_collector_node_pod_count"].value == 2
    assert by_name["node_collector_node_not_ready_pod_count"].value == 1
    assert by_name["node_collector_node_pod_count"].labels["node"] == "target-control-plane"
    assert kubernetes.requested_nodes == ["target-control-plane"]


def test_node_collector_kubernetes_request_is_server_side_node_scoped(monkeypatch) -> None:
    module = load_kubernetes_api_module()
    captured: dict[str, object] = {}

    class StubResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"items": []}

    class StubAsyncClient:
        def __init__(self, **kwargs: object) -> None:
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(self, url: str, **kwargs: object) -> StubResponse:
            captured["url"] = url
            captured["request_kwargs"] = kwargs
            return StubResponse()

    monkeypatch.setattr(module.httpx, "AsyncClient", StubAsyncClient)
    monkeypatch.setattr(
        module.Path,
        "read_text",
        lambda _path, **_kwargs: "agent-worker-token",
    )

    payload = asyncio.run(module.KubernetesApiClient().list_pods_on_node("target-control-plane"))

    assert payload == {"items": []}
    assert captured["url"] == "https://kubernetes.default.svc:443/api/v1/pods"
    request_kwargs = captured["request_kwargs"]
    assert isinstance(request_kwargs, dict)
    assert request_kwargs["params"] == {"fieldSelector": "spec.nodeName=target-control-plane"}


def test_node_collector_kubernetes_request_rejects_unbounded_node_scope() -> None:
    module = load_kubernetes_api_module()

    with pytest.raises(ValueError, match="node_name is required for bounded pod collection"):
        asyncio.run(module.KubernetesApiClient().list_pods_on_node("  "))


def test_collector_status_metric_adds_collector_label() -> None:
    module = load_metric_collectors_module()

    sample = module.collector_status_metric_sample(
        {"node": "target-control-plane", "runtime": "containerd"},
        "pod",
        has_error=True,
    )

    assert sample.name == "node_collector_scrape_error"
    assert sample.value == 1
    assert sample.labels["collector"] == "pod"
