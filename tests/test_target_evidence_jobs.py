from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from domains.identity.dependencies import ClusterAgentIdentity
from domains.target.router import (
    evidence_job_result,
    poll_evidence_job,
    schedule_evidence_jobs,
)
from packages.contracts.gateway.requests import (
    EvidenceJobResultRequest,
    EvidenceJobScheduleRequest,
)

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_DIR = ROOT_DIR / "src" / "services" / "target" / "cluster-agent"
IDENTITY = ClusterAgentIdentity(workspace_id="workspace-1", cluster_id="cluster-1")


def load_evidence_module():
    module_names = (
        "queries",
        "queries.payloads",
        "queries.registry",
        "evidence",
        "evidence.collector",
        "evidence.jobs",
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
        provider_key = evidence_keys[0]
        self.collected.append(provider_key)
        if provider_key in self.failing_keys:
            raise RuntimeError(f"{provider_key} failed")
        if provider_key == "metrics":
            return {"metrics": {"source": "prometheus", "results": {}}}
        if provider_key == "logs":
            return {"logs": [{"source": "loki", "streams": []}]}
        return {"traces": {"source": "tempo", "results": {}}}


class FakeEvidenceJobClient:
    def __init__(self) -> None:
        self.scheduled: list[dict[str, Any]] = []
        self.completed: list[dict[str, Any]] = []
        self.jobs: list[dict[str, Any]] = []

    async def schedule_evidence_jobs(
        self,
        source_id: str,
        window_start: str,
        provider_keys: list[str],
    ) -> dict[str, Any]:
        request = {
            "source_id": source_id,
            "window_start": window_start,
            "provider_keys": provider_keys,
        }
        self.scheduled.append(request)
        return {
            "accepted": True,
            "evidence_key": f"workspace-1:cluster-1:{source_id}:{window_start}",
            "queued": len(provider_keys),
            "job_ids": [f"job-{provider_key}" for provider_key in provider_keys],
        }

    async def poll_evidence_job(
        self,
        provider_key: str,
        agent_id: str,
        timeout_seconds: int,
    ) -> dict[str, Any] | None:
        if not self.jobs:
            return None
        return self.jobs.pop(0)

    async def complete_evidence_job(
        self,
        job_id: str,
        agent_id: str,
        lease_id: str,
        status: str,
        result: dict[str, Any],
        error: str,
    ) -> dict[str, Any]:
        response = {
            "job_id": job_id,
            "agent_id": agent_id,
            "lease_id": lease_id,
            "status": status,
            "result": result,
            "error": error,
        }
        self.completed.append(response)
        return {"accepted": True, "evidence_key": "evidence-1"}


def make_scheduler(module: Any, collector: FakeCollector | None = None):
    return module.EvidenceJobScheduler(
        cluster_id="cluster-1",
        workspace_id="workspace-1",
        agent_id="agent-1",
        source_id="cluster-snapshot",
        collector=collector or FakeCollector(),
        provider_keys=("metrics", "logs", "traces"),
        provider_worker_counts={"metrics": 1, "logs": 1, "traces": 1},
        interval_seconds=8,
    )


def test_central_scheduler_registers_due_provider_jobs_without_local_queue() -> None:
    module = load_evidence_module()
    client = FakeEvidenceJobClient()
    scheduler = make_scheduler(module)

    evidence_key = asyncio.run(scheduler.schedule_once(client, now=100.0))

    assert evidence_key == "workspace-1:cluster-1:cluster-snapshot:1970-01-01T00:01:36+00:00"
    assert client.scheduled[0]["provider_keys"] == ["metrics", "logs", "traces"]


def test_central_worker_polls_job_and_reports_provider_result() -> None:
    module = load_evidence_module()
    client = FakeEvidenceJobClient()
    client.jobs.append(
        {
            "job_id": "job-metrics",
            "provider_key": "metrics",
            "lease_id": "lease-1",
        }
    )
    collector = FakeCollector()
    scheduler = make_scheduler(module, collector)

    assert asyncio.run(scheduler.work_once(client, "metrics", "metrics-worker")) is True

    assert collector.collected == ["metrics"]
    assert client.completed[0]["status"] == "completed"
    assert client.completed[0]["result"]["metrics"]["source"] == "prometheus"


def test_central_worker_reports_provider_failure_for_retry_budget() -> None:
    module = load_evidence_module()
    client = FakeEvidenceJobClient()
    client.jobs.append(
        {
            "job_id": "job-traces",
            "provider_key": "traces",
            "lease_id": "lease-1",
        }
    )
    scheduler = make_scheduler(module, FakeCollector({"traces"}))

    assert asyncio.run(scheduler.work_once(client, "traces", "traces-worker")) is True

    assert client.completed[0]["status"] == "failed"
    assert client.completed[0]["error"] == "traces failed"


class FakeEvidenceJobDb:
    def __init__(self) -> None:
        self.completed: list[dict[str, Any]] = []
        self.claimed: list[str] = []
        self.recorded: list[dict[str, Any]] = []

    def queue_evidence_jobs(self, **kwargs: Any) -> dict[str, Any]:
        return {
            "accepted": True,
            "evidence_key": (
                f"{kwargs['workspace_id']}:{kwargs['cluster_id']}:"
                f"{kwargs['source_id']}:{kwargs['window_start']}"
            ),
            "queued": len(kwargs["provider_keys"]),
            "job_ids": [f"job-{provider}" for provider in kwargs["provider_keys"]],
        }

    def get_cluster_policy(self, _workspace_id: str, _cluster_id: str) -> None:
        return None

    async def lease_evidence_job(self, **_kwargs: Any) -> dict[str, Any]:
        return {
            "job_id": "job-metrics",
            "provider_key": "metrics",
            "lease_id": "lease-1",
        }

    def complete_evidence_job(self, **kwargs: Any) -> dict[str, Any]:
        self.completed.append(kwargs)
        return {
            "job_id": kwargs["job_id"],
            "evidence_key": "workspace-1:cluster-1:cluster-snapshot:window-1",
            "status": kwargs["status"],
        }

    def get_evidence_window(self, _evidence_key: str) -> None:
        return None

    def evidence_payload_if_ready(self, _evidence_key: str) -> dict[str, Any]:
        return {
            "workspace_id": "workspace-1",
            "cluster_id": "cluster-1",
            "source_id": "cluster-snapshot",
            "window_start": "window-1",
            "evidence_key": "workspace-1:cluster-1:cluster-snapshot:window-1",
            "agent_id": "agent-1",
            "kubernetes": {},
            "metrics": {"source": "prometheus"},
            "logs": [],
            "traces": {"source": "tempo", "results": {}},
        }

    def claim_evidence_window(self, evidence_key: str, *_args: object) -> dict[str, Any]:
        self.claimed.append(evidence_key)
        return {"duplicate": False, "event_id": "pending-1", "correlation_id": "pending-1"}

    def complete_evidence_window(
        self,
        evidence_key: str,
        event_id: str,
        correlation_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self.recorded.append(
            {
                "evidence_key": evidence_key,
                "event_id": event_id,
                "correlation_id": correlation_id,
                "payload": payload,
            }
        )
        return {"event_id": event_id, "correlation_id": correlation_id}

    def release_pending_evidence_window(self, _evidence_key: str) -> None:
        raise AssertionError("release should not be called")


class FakeEvents:
    def __init__(self) -> None:
        self.body: object | None = None

    async def accept_body(
        self,
        body: object,
        _correlation_id: str | None = None,
    ) -> SimpleNamespace:
        self.body = body
        return SimpleNamespace(event=SimpleNamespace(event_id="evt-1", correlation_id="corr-1"))


def test_schedule_evidence_jobs_uses_identity_scoped_central_ticket_queue() -> None:
    db = FakeEvidenceJobDb()
    response = asyncio.run(
        schedule_evidence_jobs(
            EvidenceJobScheduleRequest(
                source_id="cluster-snapshot",
                window_start="window-1",
                provider_keys=["metrics", "logs"],
            ),
            IDENTITY,
            db,
        )
    )

    assert response.evidence_key == "workspace-1:cluster-1:cluster-snapshot:window-1"
    assert response.queued == 2


def test_poll_evidence_job_leases_central_ticket() -> None:
    response = asyncio.run(
        poll_evidence_job(
            "metrics",
            "agent-1",
            1,
            IDENTITY,
            FakeEvidenceJobDb(),
        )
    )

    assert response.job is not None
    assert response.job["lease_id"] == "lease-1"


def test_evidence_job_result_emits_window_once_when_all_jobs_ready() -> None:
    db = FakeEvidenceJobDb()
    events = FakeEvents()

    response = asyncio.run(
        evidence_job_result(
            "job-metrics",
            EvidenceJobResultRequest(
                agent_id="agent-1",
                lease_id="lease-1",
                status="completed",
                result={"metrics": {"source": "prometheus"}},
            ),
            IDENTITY,
            db,
            events,
        )
    )

    assert response.event_id == "evt-1"
    assert db.claimed == ["workspace-1:cluster-1:cluster-snapshot:window-1"]
    assert db.recorded[0]["payload"]["workspace_id"] == "workspace-1"
    assert events.body is not None
    assert events.body.evidence_key == "workspace-1:cluster-1:cluster-snapshot:window-1"
