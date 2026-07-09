from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
NODE_COLLECTOR_PATH = (
    ROOT_DIR / "src" / "services" / "target" / "node-collector" / "metric_collectors.py"
)


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


class StubKubernetesApi:
    async def list_pods(self) -> dict[str, object]:
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
    collector = module.PodMetricCollector(StubKubernetesApi(), "target-control-plane")

    samples = asyncio.run(
        collector.collect({"node": "target-control-plane", "runtime": "containerd"})
    )

    by_name = {sample.name: sample for sample in samples}

    assert collector.collector_name == "pod"
    assert by_name["node_collector_node_pod_count"].value == 2
    assert by_name["node_collector_node_not_ready_pod_count"].value == 1
    assert by_name["node_collector_node_pod_count"].labels["node"] == "target-control-plane"


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
