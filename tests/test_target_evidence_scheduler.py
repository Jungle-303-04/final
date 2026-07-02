from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path
from typing import Any

import pytest

from packages.contracts.gateway.requests import AgentEvidenceRequest

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_DIR = ROOT_DIR / "services" / "target-cluster-agent"


def load_scheduler_module():
    module_names = (
        "evidence",
        "evidence.collector",
        "evidence.scheduler",
        "evidence.store",
        "evidence.uploader",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(TARGET_AGENT_DIR))
    try:
        return importlib.import_module("evidence")
    finally:
        sys.path.remove(str(TARGET_AGENT_DIR))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


class FakeCollector:
    def __init__(self, failing_keys: set[str] | None = None) -> None:
        self.failing_keys = failing_keys or set()
        self.collected: list[str] = []

    async def collect(self, *evidence_keys: str) -> dict[str, Any]:
        evidence_key = evidence_keys[0]
        self.collected.append(evidence_key)
        if evidence_key in self.failing_keys:
            raise RuntimeError(f"{evidence_key} failed")
        if evidence_key == "metrics":
            return {"metrics": {"source": "prometheus", "results": {}}}
        if evidence_key == "logs":
            return {"logs": [{"source": "loki", "streams": []}]}
        if evidence_key == "traces":
            return {"traces": {"source": "tempo", "results": {}}}
        raise ValueError(f"unexpected evidence key: {evidence_key}")


class FakeClient:
    def __init__(self, status_code: int = 200) -> None:
        self.status_code = status_code
        self.shipped: list[dict[str, Any]] = []

    async def ship_evidence(self, evidence: dict[str, Any]) -> int:
        self.shipped.append(evidence)
        return self.status_code


def make_scheduler(
    module: Any,
    tmp_path: Path,
    collector: FakeCollector,
    *,
    failure_policy: str | None = None,
):
    kwargs: dict[str, Any] = {}
    if failure_policy is not None:
        kwargs["failure_policy"] = failure_policy
    return module.EvidenceScheduler(
        cluster_id="cluster-1",
        collector=collector,
        store=module.EvidenceTaskStore(str(tmp_path / "evidence-queue.db")),
        provider_keys=("metrics", "logs", "traces"),
        provider_worker_counts={"metrics": 1, "logs": 2, "traces": 1},
        interval_seconds=8,
        lease_seconds=60,
        max_attempts=1,
        **kwargs,
    )


def test_store_recovers_provider_task_and_builds_collection_payload(tmp_path: Path) -> None:
    module = load_scheduler_module()
    store = module.EvidenceTaskStore(str(tmp_path / "evidence-queue.db"))

    store.create_collection(
        collection_id="collection-1",
        cluster_id="cluster-1",
        provider_keys=("metrics", "logs", "traces"),
        scheduled_for=100.0,
        now=100.0,
    )

    metrics_task = store.lease_task("metrics", "metrics-worker", lease_seconds=5, now=101.0)
    logs_task = store.lease_task("logs", "logs-worker", lease_seconds=5, now=101.0)
    assert metrics_task is not None
    assert logs_task is not None
    assert store.lease_task("metrics", "other-worker", lease_seconds=5, now=101.0) is None

    store.recover_expired_leases(107.0)
    metrics_task = store.lease_task("metrics", "metrics-worker", lease_seconds=5, now=108.0)
    traces_task = store.lease_task("traces", "traces-worker", lease_seconds=5, now=108.0)
    assert metrics_task is not None
    assert metrics_task.attempt_count == 2
    assert traces_task is not None

    store.complete_task(
        metrics_task,
        {"metrics": {"source": "prometheus", "results": {}}},
        now=109.0,
    )
    store.complete_task(
        logs_task,
        {"logs": [{"source": "loki", "streams": []}]},
        now=109.0,
    )
    store.complete_task(
        traces_task,
        {"traces": {"source": "tempo", "results": {}}},
        now=109.0,
    )

    assert store.next_uploadable_collection() == "collection-1"
    payload = store.evidence_payload("collection-1")
    validated = AgentEvidenceRequest.model_validate(payload)
    assert validated.cluster_id == "cluster-1"
    assert validated.correlation_id == "collection-1"
    assert validated.metrics["source"] == "prometheus"
    assert validated.logs[0]["source"] == "loki"
    assert validated.traces["source"] == "tempo"


def test_scheduler_runs_provider_workers_and_aggregates_completed_collection(
    tmp_path: Path,
) -> None:
    module = load_scheduler_module()
    collector = FakeCollector()
    scheduler = make_scheduler(module, tmp_path, collector)
    client = FakeClient()

    collection_id = scheduler.schedule_once(now=100.0)
    assert collection_id == "cluster-1:100000"
    assert asyncio.run(scheduler.work_once("metrics", "metrics-worker"))
    assert asyncio.run(scheduler.work_once("logs", "logs-worker"))
    assert asyncio.run(scheduler.work_once("traces", "traces-worker"))
    assert asyncio.run(scheduler.upload_once(client)) == module.UPLOAD_DONE

    assert collector.collected == ["metrics", "logs", "traces"]
    assert len(client.shipped) == 1
    shipped = AgentEvidenceRequest.model_validate(client.shipped[0])
    assert shipped.cluster_id == "cluster-1"
    assert shipped.correlation_id == collection_id
    assert shipped.metrics["source"] == "prometheus"
    assert shipped.logs[0]["source"] == "loki"
    assert shipped.traces["source"] == "tempo"
    assert not scheduler.store.has_unuploaded_collection()


def test_scheduler_requires_authority_to_resize_worker_pool(tmp_path: Path) -> None:
    module = load_scheduler_module()
    authority = object()
    scheduler = module.EvidenceScheduler(
        cluster_id="cluster-1",
        collector=FakeCollector(),
        store=module.EvidenceTaskStore(str(tmp_path / "evidence-queue.db")),
        provider_keys=("metrics",),
        provider_worker_counts={"metrics": 1},
        interval_seconds=8,
        lease_seconds=60,
        worker_pool_authority=authority,
    )

    assert scheduler.resize_provider_workers("metrics", 2, authority=authority) == 2
    with pytest.raises(PermissionError):
        scheduler.resize_provider_workers("metrics", 3, authority=object())


def test_allow_partial_policy_uploads_collection_with_empty_failed_provider(
    tmp_path: Path,
) -> None:
    module = load_scheduler_module()
    scheduler = make_scheduler(module, tmp_path, FakeCollector({"traces"}))
    client = FakeClient()

    scheduler.schedule_once(now=100.0)
    assert asyncio.run(scheduler.work_once("metrics", "metrics-worker"))
    assert asyncio.run(scheduler.work_once("logs", "logs-worker"))
    assert asyncio.run(scheduler.work_once("traces", "traces-worker"))
    assert asyncio.run(scheduler.upload_once(client)) == module.UPLOAD_DONE

    shipped = AgentEvidenceRequest.model_validate(client.shipped[0])
    assert shipped.metrics["source"] == "prometheus"
    assert shipped.logs[0]["source"] == "loki"
    assert shipped.traces == {}


def test_strict_policy_marks_collection_failed_without_upload(tmp_path: Path) -> None:
    module = load_scheduler_module()
    scheduler = make_scheduler(
        module,
        tmp_path,
        FakeCollector({"traces"}),
        failure_policy=module.FAILURE_POLICY_STRICT,
    )
    client = FakeClient()

    collection_id = scheduler.schedule_once(now=100.0)
    assert asyncio.run(scheduler.work_once("metrics", "metrics-worker"))
    assert asyncio.run(scheduler.work_once("logs", "logs-worker"))
    assert asyncio.run(scheduler.work_once("traces", "traces-worker"))
    assert asyncio.run(scheduler.upload_once(client)) == module.UPLOAD_SKIPPED

    assert collection_id is not None
    assert client.shipped == []
    assert not scheduler.store.has_unuploaded_collection()


def test_upload_failure_keeps_collection_open_for_retry(tmp_path: Path) -> None:
    module = load_scheduler_module()
    scheduler = make_scheduler(module, tmp_path, FakeCollector())

    scheduler.schedule_once(now=100.0)
    assert asyncio.run(scheduler.work_once("metrics", "metrics-worker"))
    assert asyncio.run(scheduler.work_once("logs", "logs-worker"))
    assert asyncio.run(scheduler.work_once("traces", "traces-worker"))
    assert asyncio.run(scheduler.upload_once(FakeClient(status_code=500))) == module.UPLOAD_FAILED

    assert scheduler.store.has_unuploaded_collection()
    assert scheduler.store.next_uploadable_collection() is not None
