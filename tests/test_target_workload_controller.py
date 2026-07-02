from __future__ import annotations

import importlib
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_DIR = ROOT_DIR / "services" / "target-cluster-agent"


def load_workload_modules():
    module_names = (
        "workload",
        "workload.controller",
        "evidence",
        "evidence.store",
        "span",
        "span.base",
        "span.otel",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(TARGET_AGENT_DIR))
    try:
        return importlib.import_module("workload"), importlib.import_module("evidence")
    finally:
        sys.path.remove(str(TARGET_AGENT_DIR))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


class FakeWorkerPool:
    def __init__(
        self,
        provider_keys: tuple[str, ...],
        worker_counts: dict[str, int],
    ) -> None:
        self.provider_keys = provider_keys
        self.worker_counts = worker_counts

    def current_worker_counts(self) -> dict[str, int]:
        return dict(self.worker_counts)

    def resize_provider_workers(
        self,
        provider_key: str,
        worker_count: int,
        *,
        authority: object,
    ) -> int:
        self.worker_counts[provider_key] = worker_count
        return worker_count


def test_controller_scales_up_target_agent_worker_pool_for_backlog(tmp_path: Path) -> None:
    workload, evidence = load_workload_modules()
    store = evidence.EvidenceTaskStore(str(tmp_path / "evidence-queue.db"))
    store.create_collection(
        collection_id="collection-1",
        cluster_id="cluster-1",
        provider_keys=("metrics",),
        scheduled_for=100.0,
        now=100.0,
    )
    worker_pool = FakeWorkerPool(("metrics",), {"metrics": 1})
    controller = workload.ClusterWorkloadController(
        worker_pool=worker_pool,
        store=store,
        authority=object(),
        min_worker_counts={"metrics": 1},
        max_worker_counts={"metrics": 3},
        interval_seconds=5,
        queue_age_target_seconds=15,
    )

    decisions = controller.reconcile_once(now=120.0)

    assert worker_pool.worker_counts["metrics"] == 2
    assert decisions["metrics"].desired_workers == 2
    assert decisions["metrics"].reason == "queued_task_waited_too_long"


def test_controller_scales_down_idle_target_agent_worker_pool(tmp_path: Path) -> None:
    workload, evidence = load_workload_modules()
    store = evidence.EvidenceTaskStore(str(tmp_path / "evidence-queue.db"))
    worker_pool = FakeWorkerPool(("logs",), {"logs": 3})
    controller = workload.ClusterWorkloadController(
        worker_pool=worker_pool,
        store=store,
        authority=object(),
        min_worker_counts={"logs": 1},
        max_worker_counts={"logs": 3},
        interval_seconds=5,
        queue_age_target_seconds=15,
    )

    decisions = controller.reconcile_once(now=120.0)

    assert worker_pool.worker_counts["logs"] == 2
    assert decisions["logs"].desired_workers == 2
    assert decisions["logs"].reason == "idle_worker_pool"
