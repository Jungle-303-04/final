from __future__ import annotations

import asyncio
import importlib
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from sqlalchemy.exc import OperationalError

from domains.identity.dependencies import ClusterAgentIdentity
from domains.target.evidence_jobs import (
    PENDING_EVIDENCE_EVENT_ID_PREFIX,
    aggregate_evidence_payload,
)
from domains.target.router import (
    complete_evidence_payload,
    db_call,
    evidence_job_result,
    poll_evidence_job,
    schedule_evidence_jobs,
    touch_agent_seen,
)
from packages.contracts.gateway.requests import (
    EvidenceJobResultRequest,
    EvidenceJobScheduleRequest,
)

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_DIR = ROOT_DIR / "src" / "services" / "target" / "cluster-agent"
IDENTITY = ClusterAgentIdentity(workspace_id="workspace-1", cluster_id="cluster-1")


def test_agent_heartbeat_preserves_capabilities_registered_by_connect() -> None:
    recorded: list[dict[str, Any]] = []

    class HeartbeatDb:
        def save_cluster_agent_status(self, **kwargs: Any) -> None:
            recorded.append(kwargs)

    touch_agent_seen(HeartbeatDb(), IDENTITY, "agent-1")

    assert recorded == [
        {
            "workspace_id": "workspace-1",
            "cluster_id": "cluster-1",
            "agent_id": "agent-1",
            "capabilities": None,
            "status": "connected",
            "details": {"heartbeat_source": "agent_api"},
        }
    ]


class DeadlockOrig(Exception):
    sqlstate = "40P01"


def load_evidence_module():
    module_names = (
        "config",
        "queries",
        "queries.payloads",
        "queries.registry",
        "span",
        "span.base",
        "span.otel",
        "providers",
        "providers.base",
        "providers.collection_limits",
        "providers.kubernetes_utils",
        "providers.kubernetes_providers",
        "providers.loki_providers",
        "providers.metadata_config_objects",
        "providers.metadata_config_refs",
        "providers.metadata_endpoint_slices",
        "providers.metadata_ownership",
        "providers.metadata_resource_quotas",
        "providers.metadata_providers",
        "providers.metadata_service_selectors",
        "providers.metadata_workload_snapshots",
        "providers.prometheus_analysis",
        "providers.prometheus_providers",
        "providers.tempo_analysis",
        "providers.tempo_providers",
        "kubernetes_api",
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


class InMemoryEvidenceCollector:
    def __init__(self, failing_keys: set[str] | None = None) -> None:
        self.failing_keys = failing_keys or set()
        self.collected: list[str] = []

    async def collect(self, *evidence_keys: str) -> dict[str, Any]:
        provider_key = evidence_keys[0]
        self.collected.append(provider_key)
        if provider_key in self.failing_keys:
            raise RuntimeError(f"{provider_key} failed")
        if provider_key == "kubernetes":
            return {"kubernetes": {"cluster": {"cluster_id": "cluster-1"}}}
        if provider_key == "metrics":
            return {"metrics": {"source": "prometheus", "results": {}}}
        if provider_key == "logs":
            return {"logs": [{"source": "loki", "streams": []}]}
        return {"traces": {"source": "tempo", "results": {}}}

    async def collect_query_policy(
        self,
        evidence_key: str,
        definitions: tuple[object, ...],
        *,
        failure_policy: str = "allow_partial",
    ) -> dict[str, Any]:
        del failure_policy
        if not definitions:
            raise RuntimeError(f"{evidence_key} missing query policy")
        return await self.collect(evidence_key)


class StubEvidenceJobClient:
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


def make_scheduler(module: Any, collector: InMemoryEvidenceCollector | None = None):
    return module.EvidenceJobScheduler(
        cluster_id="cluster-1",
        workspace_id="workspace-1",
        agent_id="agent-1",
        source_id="cluster-snapshot",
        collector=collector or InMemoryEvidenceCollector(),
        provider_keys=("kubernetes", "metrics", "logs", "traces"),
        provider_worker_counts={"kubernetes": 1, "metrics": 1, "logs": 1, "traces": 1},
        interval_seconds=8,
    )


def test_central_scheduler_registers_due_provider_jobs_without_local_queue() -> None:
    module = load_evidence_module()
    client = StubEvidenceJobClient()
    scheduler = make_scheduler(module)

    evidence_key = asyncio.run(scheduler.schedule_once(client, now=100.0))

    assert evidence_key == "workspace-1:cluster-1:cluster-snapshot:1970-01-01T00:01:36+00:00"
    assert client.scheduled[0]["provider_keys"] == ["kubernetes", "metrics", "logs", "traces"]


def test_scheduler_registers_dynamic_provider_without_rebuilding_workers() -> None:
    module = load_evidence_module()
    scheduler = module.EvidenceJobScheduler(
        cluster_id="cluster-1",
        workspace_id="workspace-1",
        agent_id="agent-1",
        source_id="cluster-snapshot",
        collector=InMemoryEvidenceCollector(),
        provider_keys=("kubernetes",),
        provider_worker_counts={"kubernetes": 1},
        interval_seconds=8,
    )

    scheduler.register_provider(
        "metrics",
        worker_count=2,
        interval_seconds=15,
        enabled=True,
    )

    assert scheduler.provider_keys == ("kubernetes", "metrics")
    assert scheduler.provider_worker_counts["metrics"] == 2
    assert scheduler.provider_intervals["metrics"] == 15
    assert "metrics" in scheduler.enabled_provider_keys
    assert scheduler.next_provider_runs["metrics"] == 0.0


def test_central_worker_polls_job_and_reports_provider_result() -> None:
    module = load_evidence_module()
    client = StubEvidenceJobClient()
    client.jobs.append(
        {
            "job_id": "job-metrics",
            "provider_key": "metrics",
            "lease_id": "lease-1",
            "provider_policy": {"queries": [{"name": "up", "query": "up"}]},
        }
    )
    collector = InMemoryEvidenceCollector()
    scheduler = make_scheduler(module, collector)

    assert asyncio.run(scheduler.work_once(client, "metrics", "metrics-worker")) is True

    assert collector.collected == ["metrics"]
    assert client.completed[0]["status"] == "completed"
    assert client.completed[0]["result"]["metrics"]["source"] == "prometheus"


def test_success_result_report_error_does_not_mark_job_failed() -> None:
    module = load_evidence_module()

    class FailingCompleteClient(StubEvidenceJobClient):
        async def complete_evidence_job(
            self,
            job_id: str,
            agent_id: str,
            lease_id: str,
            status: str,
            result: dict[str, Any],
            error: str,
        ) -> dict[str, Any]:
            self.completed.append(
                {
                    "job_id": job_id,
                    "agent_id": agent_id,
                    "lease_id": lease_id,
                    "status": status,
                    "result": result,
                    "error": error,
                }
            )
            raise RuntimeError("result endpoint unavailable")

    client = FailingCompleteClient()
    client.jobs.append(
        {
            "job_id": "job-metrics",
            "provider_key": "metrics",
            "lease_id": "lease-1",
            "provider_policy": {"queries": [{"name": "up", "query": "up"}]},
        }
    )
    scheduler = make_scheduler(module, InMemoryEvidenceCollector())

    with pytest.raises(RuntimeError, match="result endpoint unavailable"):
        asyncio.run(scheduler.work_once(client, "metrics", "metrics-worker"))

    assert [attempt["status"] for attempt in client.completed] == ["completed"]


def test_central_worker_reports_provider_failure_for_retry_budget() -> None:
    module = load_evidence_module()
    client = StubEvidenceJobClient()
    client.jobs.append(
        {
            "job_id": "job-traces",
            "provider_key": "traces",
            "lease_id": "lease-1",
            "provider_policy": {"queries": [{"name": "slow_spans", "query": "{}"}]},
        }
    )
    scheduler = make_scheduler(module, InMemoryEvidenceCollector({"traces"}))

    assert asyncio.run(scheduler.work_once(client, "traces", "traces-worker")) is True

    assert client.completed[0]["status"] == "failed"
    assert client.completed[0]["error"] == "traces failed"


def test_strict_job_reports_provider_transport_failure_for_server_retry() -> None:
    module = load_evidence_module()
    provider = module.PrometheusMetricsProvider("https://prometheus.test")

    async def fail_query(_client: object, _query: object) -> dict[str, Any]:
        raise httpx.ConnectError("prometheus unavailable")

    provider.query = fail_query
    client = StubEvidenceJobClient()
    client.jobs.append(
        {
            "job_id": "job-metrics",
            "provider_key": "metrics",
            "lease_id": "lease-1",
            "failure_policy": "strict",
            "provider_policy": {"queries": [{"name": "up", "query": "up"}]},
        }
    )
    scheduler = make_scheduler(module, module.EvidenceCollector([provider]))

    assert asyncio.run(scheduler.work_once(client, "metrics", "metrics-worker")) is True

    assert client.completed[0]["status"] == "failed"
    assert client.completed[0]["result"] == {}
    assert client.completed[0]["error"] == "prometheus unavailable"


def test_allow_partial_job_keeps_empty_fallback_after_provider_transport_failure() -> None:
    module = load_evidence_module()
    provider = module.PrometheusMetricsProvider("https://prometheus.test")

    async def fail_query(_client: object, _query: object) -> dict[str, Any]:
        raise httpx.ConnectError("prometheus unavailable")

    provider.query = fail_query
    client = StubEvidenceJobClient()
    client.jobs.append(
        {
            "job_id": "job-metrics",
            "provider_key": "metrics",
            "lease_id": "lease-1",
            "failure_policy": "allow_partial",
            "provider_policy": {"queries": [{"name": "up", "query": "up"}]},
        }
    )
    scheduler = make_scheduler(module, module.EvidenceCollector([provider]))

    assert asyncio.run(scheduler.work_once(client, "metrics", "metrics-worker")) is True

    assert client.completed[0]["status"] == "completed"
    assert client.completed[0]["result"] == {"metrics": {"source": "prometheus", "results": {}}}
    assert client.completed[0]["error"] == ""


class StaticEvidenceCollector:
    def __init__(self, result: dict[str, Any]) -> None:
        self.result = result

    async def collect_query_policy(
        self,
        _evidence_key: str,
        _definitions: tuple[object, ...],
        *,
        failure_policy: str = "allow_partial",
    ) -> dict[str, Any]:
        del failure_policy
        return self.result


def run_scoped_job(
    provider_key: str,
    *,
    namespace: str = "sandbox",
    pod_names: list[str] | None = None,
    resource_kind: str = "Deployment",
    resource_name: str = "",
) -> dict[str, Any]:
    query_by_provider = {
        "kubernetes": "sandbox",
        "metrics": "up",
        "logs": '{} |= "ERROR"',
        "traces": "{ status = error }",
        "metadata": "change_context",
    }
    release_context: dict[str, Any] = {
        "evidence_scope": "rca_test_run",
        "namespace": namespace,
        "resource_kind": resource_kind,
        "resource_name": resource_name,
    }
    if pod_names is not None:
        release_context["pod_names"] = pod_names
    return {
        "job_id": f"job-{provider_key}",
        "provider_key": provider_key,
        "lease_id": "lease-1",
        "failure_policy": "strict",
        "provider_policy": {
            "queries": [{"name": f"run_{provider_key}", "query": query_by_provider[provider_key]}],
            "release_context": release_context,
        },
    }


@pytest.mark.parametrize(
    ("provider_key", "provider_payload"),
    [
        (
            "kubernetes",
            {
                "cluster": {"cluster_id": "cluster-1", "namespace": "sandbox"},
                "pods": [],
                "events": [],
                "provider_status": {"run_kubernetes": {"status": "success"}},
            },
        ),
        (
            "metrics",
            {
                "source": "prometheus",
                "results": {"run_metrics": {"result_type": "vector", "samples": []}},
            },
        ),
        (
            "logs",
            [
                {
                    "source": "loki",
                    "query_name": "run_logs",
                    "streams": [],
                    "line_count": 0,
                }
            ],
        ),
        (
            "traces",
            {
                "source": "tempo",
                "results": {"run_traces": {"traces": [], "trace_count": 0}},
            },
        ),
        (
            "metadata",
            {"change_context": {"current_workload_snapshots": []}},
        ),
    ],
)
def test_run_scoped_strict_job_rejects_provider_result_without_actual_evidence(
    provider_key: str,
    provider_payload: object,
) -> None:
    module = load_evidence_module()
    client = StubEvidenceJobClient()
    client.jobs.append(run_scoped_job(provider_key, pod_names=["run-pod-1"]))
    collector = StaticEvidenceCollector({provider_key: provider_payload})
    scheduler = make_scheduler(module, collector)

    assert asyncio.run(scheduler.work_once(client, provider_key, f"{provider_key}-worker")) is True

    assert client.completed[0]["status"] == "failed"
    assert client.completed[0]["result"] == {}
    assert client.completed[0]["error"] == (
        f"{provider_key} provider returned no evidence for strict run-scoped job"
    )


def test_run_scoped_strict_kubernetes_job_requires_an_observed_run_pod() -> None:
    module = load_evidence_module()
    client = StubEvidenceJobClient()
    client.jobs.append(run_scoped_job("kubernetes", pod_names=["run-pod-1"]))
    collector = StaticEvidenceCollector(
        {
            "kubernetes": {
                "cluster": {"cluster_id": "cluster-1", "namespace": "sandbox"},
                "pods": [{"name": "unrelated-pod"}],
            }
        }
    )
    scheduler = make_scheduler(module, collector)

    assert asyncio.run(scheduler.work_once(client, "kubernetes", "kubernetes-worker")) is True

    assert client.completed[0]["status"] == "failed"
    assert client.completed[0]["result"] == {}


def test_run_scoped_strict_kubernetes_job_keeps_actual_run_pod_evidence() -> None:
    module = load_evidence_module()
    client = StubEvidenceJobClient()
    client.jobs.append(run_scoped_job("kubernetes", pod_names=["run-pod-1"]))
    result = {
        "kubernetes": {
            "cluster": {"cluster_id": "cluster-1", "namespace": "sandbox"},
            "pods": [{"name": "run-pod-1", "phase": "Pending"}],
        }
    }
    scheduler = make_scheduler(module, StaticEvidenceCollector(result))

    assert asyncio.run(scheduler.work_once(client, "kubernetes", "kubernetes-worker")) is True

    assert client.completed[0]["status"] == "completed"
    assert client.completed[0]["result"] == result


def test_run_scoped_strict_metadata_job_rejects_wrong_namespace_evidence() -> None:
    module = load_evidence_module()
    client = StubEvidenceJobClient()
    client.jobs.append(run_scoped_job("metadata", namespace="sandbox", resource_name="sandbox-api"))
    result = {
        "metadata": {
            "change_context": {
                "current_workload_snapshots": [
                    {
                        "workload": {
                            "kind": "Deployment",
                            "namespace": "target",
                            "name": "target-api",
                        }
                    }
                ],
                "service_selector_matches": [
                    {
                        "service": {"namespace": "sandbox", "name": "sandbox-api"},
                        "match_status": "matched",
                        "matched_pod_count": 1,
                    }
                ],
            }
        }
    }
    scheduler = make_scheduler(module, StaticEvidenceCollector(result))

    assert asyncio.run(scheduler.work_once(client, "metadata", "metadata-worker")) is True

    assert client.completed[0]["status"] == "failed"
    assert client.completed[0]["result"] == {}
    assert client.completed[0]["error"] == (
        "metadata provider returned no evidence for strict run-scoped job"
    )


def test_run_scoped_strict_metadata_job_accepts_matching_namespace_evidence() -> None:
    module = load_evidence_module()
    client = StubEvidenceJobClient()
    client.jobs.append(run_scoped_job("metadata", namespace="sandbox", resource_name="sandbox-api"))
    result = {
        "metadata": {
            "change_context": {
                "current_workload_snapshot": {
                    "workload": {
                        "kind": "Deployment",
                        "namespace": "sandbox",
                        "name": "sandbox-api",
                    }
                }
            }
        }
    }
    scheduler = make_scheduler(module, StaticEvidenceCollector(result))

    assert asyncio.run(scheduler.work_once(client, "metadata", "metadata-worker")) is True

    assert client.completed[0]["status"] == "completed"
    assert client.completed[0]["result"] == result


def test_run_scoped_strict_metadata_job_rejects_wrong_workload_in_same_namespace() -> None:
    module = load_evidence_module()
    client = StubEvidenceJobClient()
    client.jobs.append(run_scoped_job("metadata", namespace="sandbox", resource_name="sandbox-api"))
    result = {
        "metadata": {
            "change_context": {
                "current_workload_snapshots": [
                    {
                        "workload": {
                            "kind": "Deployment",
                            "namespace": "sandbox",
                            "name": "sandbox-api",
                        }
                    },
                    {
                        "workload": {
                            "kind": "Deployment",
                            "namespace": "sandbox",
                            "name": "old-sandbox-api",
                        }
                    },
                ]
            }
        }
    }
    scheduler = make_scheduler(module, StaticEvidenceCollector(result))

    assert asyncio.run(scheduler.work_once(client, "metadata", "metadata-worker")) is True

    assert client.completed[0]["status"] == "failed"
    assert client.completed[0]["result"] == {}
    assert client.completed[0]["error"] == (
        "metadata provider returned no evidence for strict run-scoped job"
    )


def test_scheduler_loop_survives_management_schedule_errors() -> None:
    module = load_evidence_module()
    scheduler = make_scheduler(module)

    class FailingScheduleClient(StubEvidenceJobClient):
        async def schedule_evidence_jobs(
            self,
            source_id: str,
            window_start: str,
            provider_keys: list[str],
        ) -> dict[str, Any]:
            raise RuntimeError("management unavailable")

    async def run_once() -> None:
        task = asyncio.create_task(scheduler.schedule_forever(FailingScheduleClient()))
        await asyncio.sleep(0.05)
        assert not task.done()
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run_once())


def test_worker_loop_survives_result_report_errors() -> None:
    module = load_evidence_module()
    scheduler = make_scheduler(module)

    class FailingCompleteClient(StubEvidenceJobClient):
        async def complete_evidence_job(
            self,
            job_id: str,
            agent_id: str,
            lease_id: str,
            status: str,
            result: dict[str, Any],
            error: str,
        ) -> dict[str, Any]:
            raise RuntimeError("result endpoint unavailable")

    client = FailingCompleteClient()
    client.jobs.append(
        {
            "job_id": "job-metrics",
            "provider_key": "metrics",
            "lease_id": "lease-1",
            "provider_policy": {"queries": [{"name": "up", "query": "up"}]},
        }
    )

    async def run_once() -> None:
        task = asyncio.create_task(scheduler.work_forever(client, "metrics", "metrics-worker"))
        await asyncio.sleep(0.05)
        assert not task.done()
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run_once())


class StubEvidenceJobDb:
    def __init__(self) -> None:
        self.completed: list[dict[str, Any]] = []
        self.claimed: list[str] = []
        self.recorded: list[dict[str, Any]] = []
        self.agent_heartbeats: list[dict[str, Any]] = []

    def save_cluster_agent_status(self, **kwargs: Any) -> None:
        # touch_agent_seen 계약 충족 — agent 경로 heartbeat 기록을 관찰 가능하게 남김
        self.agent_heartbeats.append(kwargs)

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

    def record_evidence_event_once(
        self,
        *,
        evidence_key: str,
        event_envelope: Any,
        payload: dict[str, Any],
        **kwargs: Any,
    ) -> dict[str, Any]:
        self.claimed.append(evidence_key)
        self.recorded.append(
            {
                "evidence_key": evidence_key,
                "event_id": event_envelope.event_id,
                "correlation_id": event_envelope.correlation_id,
                "event_payload": event_envelope.payload,
                "payload": payload,
                "kwargs": kwargs,
            }
        )
        return {
            "duplicate": False,
            "event_id": event_envelope.event_id,
            "correlation_id": event_envelope.correlation_id,
        }

    def release_stale_pending_evidence_window(
        self,
        _evidence_key: str,
        _stale_after_seconds: int,
    ) -> bool:
        return False


class StubEvents:
    def __init__(self) -> None:
        self.body: object | None = None
        self.source = "api-gateway"

    async def accept_body(
        self,
        body: object,
        _correlation_id: str | None = None,
    ) -> SimpleNamespace:
        self.body = body
        return SimpleNamespace(event=SimpleNamespace(event_id="evt-1", correlation_id="corr-1"))


class BulkEvidenceCollector:
    def __init__(self) -> None:
        self.calls: Counter[str] = Counter()
        self.query_names: Counter[str] = Counter()

    async def collect_query_policy(
        self,
        evidence_key: str,
        definitions: tuple[object, ...],
        *,
        failure_policy: str = "allow_partial",
    ) -> dict[str, Any]:
        del failure_policy
        if len(definitions) != 1:
            raise RuntimeError(f"expected one query for {evidence_key}, got {len(definitions)}")
        definition = definitions[0]
        self.calls[evidence_key] += 1
        self.query_names[definition.name] += 1
        if evidence_key == "kubernetes":
            return {"kubernetes": {"cluster": {"cluster_id": "cluster-1"}}}
        if evidence_key == "metrics":
            return {"metrics": {"source": "prometheus", "results": {"bulk": {}}}}
        if evidence_key == "logs":
            return {"logs": [{"source": "loki", "streams": []}]}
        return {"traces": {"source": "tempo", "results": {"bulk": {}}}}


class BulkEvidenceJobClient:
    def __init__(self) -> None:
        self.jobs_by_provider: dict[str, deque[dict[str, Any]]] = defaultdict(deque)
        self.completed_job_ids: set[str] = set()
        self.duplicate_completions: list[str] = []
        self.window_providers: dict[str, set[str]] = defaultdict(set)
        self.emitted_windows: set[str] = set()
        self.lock = asyncio.Lock()

    async def schedule_evidence_jobs(
        self,
        source_id: str,
        window_start: str,
        provider_keys: list[str],
    ) -> dict[str, Any]:
        evidence_key = f"workspace-1:cluster-1:{source_id}:{window_start}"
        async with self.lock:
            for provider_key in provider_keys:
                job_id = f"{evidence_key}:{provider_key}"
                self.jobs_by_provider[provider_key].append(
                    {
                        "job_id": job_id,
                        "evidence_key": evidence_key,
                        "provider_key": provider_key,
                        "lease_id": f"lease-{job_id}",
                        "provider_policy": {
                            "queries": [
                                {
                                    "name": f"{provider_key}_bulk_query",
                                    "description": "Bulk evidence stress query.",
                                    "query": "up",
                                }
                            ]
                        },
                    }
                )
        return {
            "accepted": True,
            "evidence_key": evidence_key,
            "queued": len(provider_keys),
            "job_ids": [f"{evidence_key}:{provider_key}" for provider_key in provider_keys],
        }

    async def poll_evidence_job(
        self,
        provider_key: str,
        agent_id: str,
        timeout_seconds: int,
    ) -> dict[str, Any] | None:
        async with self.lock:
            if not self.jobs_by_provider[provider_key]:
                return None
            job = self.jobs_by_provider[provider_key].popleft()
            job["agent_id"] = agent_id
            return job

    async def complete_evidence_job(
        self,
        job_id: str,
        agent_id: str,
        lease_id: str,
        status: str,
        result: dict[str, Any],
        error: str,
    ) -> dict[str, Any]:
        async with self.lock:
            if job_id in self.completed_job_ids:
                self.duplicate_completions.append(job_id)
            self.completed_job_ids.add(job_id)
            evidence_key, provider_key = job_id.rsplit(":", 1)
            self.window_providers[evidence_key].add(provider_key)
            if self.window_providers[evidence_key] == {
                "kubernetes",
                "metrics",
                "logs",
                "traces",
            }:
                self.emitted_windows.add(evidence_key)
        return {"accepted": True, "evidence_key": evidence_key}

    def pending_count(self) -> int:
        return sum(len(queue) for queue in self.jobs_by_provider.values())


async def drain_bulk_jobs(
    scheduler: Any,
    client: BulkEvidenceJobClient,
    provider_key: str,
    worker_index: int,
) -> int:
    processed = 0
    while await scheduler.work_once(client, provider_key, f"{provider_key}-{worker_index}"):
        processed += 1
    return processed


def test_schedule_evidence_jobs_uses_identity_scoped_central_ticket_queue() -> None:
    db = StubEvidenceJobDb()
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
            StubEvidenceJobDb(),
        )
    )

    assert response.job is not None
    assert response.job["lease_id"] == "lease-1"


def test_evidence_job_result_emits_window_once_when_all_jobs_ready() -> None:
    db = StubEvidenceJobDb()
    events = StubEvents()

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

    assert response.event_id is not None
    assert db.claimed == ["workspace-1:cluster-1:cluster-snapshot:window-1"]
    assert db.recorded[0]["payload"]["workspace_id"] == "workspace-1"
    assert db.recorded[0]["payload"]["evidence_key"] == (
        "workspace-1:cluster-1:cluster-snapshot:window-1"
    )
    event_payload = db.recorded[0]["event_payload"]
    assert event_payload["evidence_key"] == "workspace-1:cluster-1:cluster-snapshot:window-1"
    assert event_payload["kind"] == "cluster_evidence"
    assert event_payload["payload_size"] > 0
    assert event_payload["metrics"] == {}
    assert event_payload["traces"] == {}
    assert events.body is None


def test_db_call_retries_deadlock_once() -> None:
    calls = 0

    def flaky() -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise OperationalError("insert", {}, DeadlockOrig())
        return "ok"

    assert asyncio.run(db_call(flaky)) == "ok"
    assert calls == 2


def test_complete_evidence_payload_defaults_missing_provider_bodies() -> None:
    payload = complete_evidence_payload(
        {
            "workspace_id": "workspace-1",
            "cluster_id": "kubernetes-ops",
            "source_id": "cluster-snapshot",
            "window_start": "window-1",
            "evidence_key": "workspace-1:kubernetes-ops:cluster-snapshot:window-1",
            "agent_id": "mgmt-agent",
            "kubernetes": {"cluster": {"cluster_id": "kubernetes-ops"}},
        }
    )

    assert payload["kubernetes"] == {"cluster": {"cluster_id": "kubernetes-ops"}}
    assert payload["metrics"] == {}
    assert payload["logs"] == []
    assert payload["traces"] == {}


def test_complete_evidence_payload_drops_provider_transport_metadata() -> None:
    payload = complete_evidence_payload(
        {
            "workspace_id": "workspace-1",
            "cluster_id": "cluster-1",
            "source_id": "cluster-snapshot",
            "source": "kubernetes",
            "provider_status": "ok",
            "kubernetes": {"pods": []},
        }
    )

    assert payload["kubernetes"] == {"pods": []}
    assert "source" not in payload
    assert "provider_status" not in payload


def test_evidence_aggregation_keeps_only_the_leased_provider_bucket() -> None:
    payload = aggregate_evidence_payload(
        [
            {
                "workspace_id": "workspace-1",
                "cluster_id": "cluster-1",
                "source_id": "cluster-snapshot",
                "window_start": "window-1",
                "evidence_key": "workspace-1:cluster-1:cluster-snapshot:window-1",
                "agent_id": "agent-1",
                "provider_key": "kubernetes",
                "status": "completed",
                "failure_policy": "allow_partial",
                "result": {
                    "source": "kubernetes",
                    "provider_status": "ok",
                    "kubernetes": {"pods": []},
                    "metrics": {"unexpected": True},
                },
            }
        ]
    )

    assert payload is not None
    assert payload["kubernetes"] == {"pods": []}
    assert "metrics" not in payload
    assert "source" not in payload
    assert "provider_status" not in payload


def test_evidence_job_result_rejects_oversized_provider_result() -> None:
    with pytest.raises(ValueError, match="evidence payload exceeds size limit"):
        EvidenceJobResultRequest(
            agent_id="agent-1",
            lease_id="lease-1",
            status="completed",
            result={"metrics": {"series": "x" * 1_100_000}},
        )


def test_pending_evidence_window_is_not_reported_as_final_event() -> None:
    class PendingWindowDb(StubEvidenceJobDb):
        def get_evidence_window(self, _evidence_key: str) -> dict[str, str]:
            return {
                "event_id": f"{PENDING_EVIDENCE_EVENT_ID_PREFIX}existing",
                "correlation_id": f"{PENDING_EVIDENCE_EVENT_ID_PREFIX}existing",
            }

        def evidence_payload_if_ready(self, _evidence_key: str) -> dict[str, Any]:
            raise AssertionError("pending window should stop duplicate emission")

    db = PendingWindowDb()
    events = StubEvents()

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

    assert response.accepted is True
    assert response.evidence_key == "workspace-1:cluster-1:cluster-snapshot:window-1"
    assert response.event_id is None
    assert events.body is None


def test_stale_pending_evidence_window_is_reclaimed_and_emitted() -> None:
    class StaleWindowDb(StubEvidenceJobDb):
        def __init__(self) -> None:
            super().__init__()
            self.released_stale = False

        def get_evidence_window(self, _evidence_key: str) -> dict[str, str] | None:
            if self.released_stale:
                return None
            return {
                "event_id": f"{PENDING_EVIDENCE_EVENT_ID_PREFIX}stale",
                "correlation_id": f"{PENDING_EVIDENCE_EVENT_ID_PREFIX}stale",
            }

        def release_stale_pending_evidence_window(
            self,
            evidence_key: str,
            _stale_after_seconds: int,
        ) -> bool:
            self.released_stale = True
            self.claimed.append(f"released:{evidence_key}")
            return True

    db = StaleWindowDb()
    events = StubEvents()

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

    assert response.event_id is not None
    assert db.claimed == [
        "released:workspace-1:cluster-1:cluster-snapshot:window-1",
        "workspace-1:cluster-1:cluster-snapshot:window-1",
    ]
    assert events.body is None


def test_massive_evidence_jobs_complete_once_without_worker_deadlock() -> None:
    module = load_evidence_module()
    window_count = 2_000
    workers_per_provider = 8
    provider_keys = ("kubernetes", "metrics", "logs", "traces")
    collector = BulkEvidenceCollector()
    client = BulkEvidenceJobClient()
    scheduler = module.EvidenceJobScheduler(
        cluster_id="cluster-1",
        workspace_id="workspace-1",
        agent_id="agent-1",
        source_id="cluster-snapshot",
        collector=collector,
        provider_keys=provider_keys,
        provider_worker_counts={
            provider_key: workers_per_provider for provider_key in provider_keys
        },
        interval_seconds=1,
    )

    async def run_bulk() -> list[int]:
        for window_index in range(window_count):
            window_start = f"bulk-window-{window_index:05d}"
            await client.schedule_evidence_jobs(
                "cluster-snapshot",
                window_start,
                list(provider_keys),
            )
        tasks = [
            asyncio.create_task(drain_bulk_jobs(scheduler, client, provider_key, worker_index))
            for provider_key in provider_keys
            for worker_index in range(workers_per_provider)
        ]
        return await asyncio.wait_for(asyncio.gather(*tasks), timeout=10)

    processed_counts = asyncio.run(run_bulk())
    total_jobs = window_count * len(provider_keys)

    assert sum(processed_counts) == total_jobs
    assert len(client.completed_job_ids) == total_jobs
    assert client.duplicate_completions == []
    assert client.pending_count() == 0
    assert len(client.emitted_windows) == window_count
    assert sum(collector.calls.values()) == total_jobs
    for provider_key in provider_keys:
        assert collector.calls[provider_key] == window_count
        assert collector.query_names[f"{provider_key}_bulk_query"] == window_count
