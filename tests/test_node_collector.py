from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
NODE_COLLECTOR_PATH = (
    ROOT_DIR / "src" / "services" / "target" / "node-collector" / "node_collector.py"
)


def load_node_collector_module():
    spec = importlib.util.spec_from_file_location("test_node_collector_module", NODE_COLLECTOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {NODE_COLLECTOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["test_node_collector_module"] = module
    module_names = (
        "kubernetes_api",
        "metric_collectors",
        "node_collector",
        "prometheus_metrics",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(NODE_COLLECTOR_PATH.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(NODE_COLLECTOR_PATH.parent))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


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

    class StubKubernetesApi:
        async def list_pods_on_node(self, _node_name: str) -> dict[str, object]:
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
                        "status": {"conditions": [{"type": "Ready", "status": "True"}]},
                    },
                ]
            }

    collector = module.NodeCollector(
        node_name="target-control-plane",
        pod_name="optional-node-collector-abc",
        namespace="target",
        interval_seconds=15,
        kubernetes=StubKubernetesApi(),
    )

    metrics = asyncio.run(collector.prometheus_metrics())

    assert (
        'node_collector_scrape_error{node="target-control-plane",'
        'runtime="containerd",collector="pod"} 0'
    ) in metrics
    assert (
        'node_collector_node_pod_count{node="target-control-plane",runtime="containerd"} 2'
    ) in metrics
    assert (
        'node_collector_node_not_ready_pod_count{node="target-control-plane",'
        'runtime="containerd"} 1'
    ) in metrics
    assert 'node="target-control-plane"' in metrics
    assert 'runtime="containerd"' in metrics


def test_node_runtime_sampler_reads_real_proc_sources(tmp_path) -> None:
    """고정 샘플값 금지 — /proc 형식 파일에서 실측 계산을 검증."""
    module = load_node_collector_module()
    stat = tmp_path / "stat"
    meminfo = tmp_path / "meminfo"
    # cpu user nice system idle iowait irq softirq steal
    stat.write_text("cpu  100 0 100 700 100 0 0 0\n")
    meminfo.write_text("MemTotal: 1000 kB\nMemFree: 300 kB\nMemAvailable: 400 kB\n")

    sampler = module.NodeRuntimeSampler(
        proc_stat_path=str(stat),
        proc_meminfo_path=str(meminfo),
        filesystem_path=str(tmp_path),
    )

    # 첫 호출: 부팅 이후 평균 = busy(200)/total(1000)
    assert sampler.cpu_usage_ratio() == 0.2
    # 두 번째 호출: 델타 구간 — busy +80, total +100 → 0.8
    stat.write_text("cpu  160 0 120 710 110 0 0 0\n")
    assert sampler.cpu_usage_ratio() == 0.8

    # 메모리: MemTotal - MemAvailable = 600kB = 614400 bytes
    assert sampler.memory_working_set_bytes() == 600 * 1024

    # 파일시스템: 실제 statvfs 값 — 0~1 범위의 실수
    ratio = sampler.filesystem_usage_ratio()
    assert 0.0 <= ratio <= 1.0


def test_node_runtime_sampler_reports_zero_on_unreadable_sources(tmp_path) -> None:
    module = load_node_collector_module()
    sampler = module.NodeRuntimeSampler(
        proc_stat_path=str(tmp_path / "missing-stat"),
        proc_meminfo_path=str(tmp_path / "missing-meminfo"),
        filesystem_path=str(tmp_path / "missing-dir"),
    )
    assert sampler.cpu_usage_ratio() == 0.0
    assert sampler.memory_working_set_bytes() == 0
    assert sampler.filesystem_usage_ratio() == 0.0


def test_node_collector_snapshot_uses_sampler_measurements(tmp_path) -> None:
    module = load_node_collector_module()
    stat = tmp_path / "stat"
    meminfo = tmp_path / "meminfo"
    stat.write_text("cpu  100 0 100 700 100 0 0 0\n")
    meminfo.write_text("MemTotal: 2000 kB\nMemAvailable: 500 kB\n")
    collector = module.NodeCollector(
        node_name="n1",
        pod_name="p1",
        namespace="target",
        interval_seconds=15,
        sampler=module.NodeRuntimeSampler(
            proc_stat_path=str(stat),
            proc_meminfo_path=str(meminfo),
            filesystem_path=str(tmp_path),
        ),
    )
    payload = collector.snapshot().to_body()
    assert payload["cpu_usage_ratio"] == 0.2
    assert payload["memory_working_set_bytes"] == 1500 * 1024
