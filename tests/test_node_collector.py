from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
NODE_COLLECTOR_PATH = ROOT_DIR / "src" / "services" / "target" / "node-collector" / "node_collector.py"


def load_node_collector_module():
    spec = importlib.util.spec_from_file_location("test_node_collector_module", NODE_COLLECTOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {NODE_COLLECTOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["test_node_collector_module"] = module
    previous_settings = sys.modules.pop("settings", None)
    sys.path.insert(0, str(NODE_COLLECTOR_PATH.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(NODE_COLLECTOR_PATH.parent))
        sys.modules.pop("settings", None)
        if previous_settings is not None:
            sys.modules["settings"] = previous_settings


def test_node_collector_snapshot_uses_downward_api_identity() -> None:
    module = load_node_collector_module()
    collector = module.NodeCollector(
        node_name="target-control-plane",
        pod_name="optional-node-collector-abc",
        namespace="target",
        interval_seconds=15,
    )

    payload = collector.snapshot().to_body()

    assert payload["node_name"] == "target-control-plane"
    assert payload["pod_name"] == "optional-node-collector-abc"
    assert payload["namespace"] == "target"
    assert payload["runtime"] == "containerd"


def test_node_collector_exposes_prometheus_metrics() -> None:
    module = load_node_collector_module()
    collector = module.NodeCollector(
        node_name="target-control-plane",
        pod_name="optional-node-collector-abc",
        namespace="target",
        interval_seconds=15,
    )

    metrics = collector.prometheus_metrics()

    assert "node_collector_cpu_usage_ratio" in metrics
    assert 'node="target-control-plane"' in metrics
    assert 'runtime="containerd"' in metrics
