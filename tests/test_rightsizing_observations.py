from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

from domains.inventory.repository import InventoryRepository
from domains.workload_detail.rightsizing_observations import (
    RIGHTSIZING_ALGORITHM_REVISION,
    project_rightsizing_workload,
)

MEBIBYTE = 1024 * 1024


def _workload() -> dict[str, Any]:
    return {
        "snapshot_id": "snapshot-current",
        "api_version": "apps/v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout",
        "uid": "deployment-uid",
        "summary": {
            "desired_replicas": 2,
            "pod_template": {
                "spec": {
                    "containers": [
                        {
                            "name": "server",
                            "resources": {"requests": {"cpu": "100m", "memory": "128Mi"}},
                        }
                    ]
                }
            },
        },
    }


def _dependents(*, complete: bool = True) -> list[dict[str, Any]]:
    return [
        {
            "snapshot_id": "snapshot-current",
            "resource_type": "workload_revision",
            "kind": "ReplicaSet",
            "namespace": "shop",
            "name": "checkout-7f5c",
            "uid": "replicaset-uid",
            "summary": {
                "owner_uid": "deployment-uid",
                "owner_references_complete": complete,
            },
        },
        {
            "snapshot_id": "snapshot-current",
            "resource_type": "pod",
            "kind": "Pod",
            "namespace": "shop",
            "name": "checkout-7f5c-a",
            "uid": "pod-a",
            "summary": {
                "owner_uid": "replicaset-uid",
                "owner_references_complete": complete,
            },
        },
        {
            "snapshot_id": "snapshot-current",
            "resource_type": "pod",
            "kind": "Pod",
            "namespace": "shop",
            "name": "checkout-7f5c-b",
            "uid": "pod-b",
            "summary": {
                "owner_uid": "replicaset-uid",
                "owner_references_complete": complete,
            },
        },
    ]


def _samples(count: int = 72) -> list[dict[str, Any]]:
    started_at = datetime(2026, 7, 16, 0, 0, tzinfo=UTC)
    samples: list[dict[str, Any]] = []
    for index in range(count):
        sampled_at = started_at + timedelta(minutes=index * 5)
        samples.append(
            {
                "id": index + 1,
                "sampled_at": sampled_at,
                "usage": {
                    "pods": {
                        "shop/checkout-7f5c-a": {
                            "uid": "pod-a",
                            "container_metrics_complete": True,
                            "container_metrics": [
                                {"name": "server", "cpu_mcores": 180, "mem_mib": 192}
                            ],
                        },
                        "shop/checkout-7f5c-b": {
                            "uid": "pod-b",
                            "container_metrics_complete": True,
                            "container_metrics": [
                                {"name": "server", "cpu_mcores": 200, "mem_mib": 200}
                            ],
                        },
                    }
                },
            }
        )
    return samples


def test_agent_usage_history_projects_exact_owner_chain_and_versioned_recommendations() -> None:
    projection = project_rightsizing_workload(
        _workload(),
        dependents=_dependents(),
        usage_samples=_samples(),
        snapshot_complete=True,
    )

    assert projection.reason_code is None
    assert projection.has_data is True
    assert projection.observation is not None
    observed = projection.observation
    assert observed.availability == "partial"
    assert observed.provenance.collector == "cluster-agent"
    assert observed.provenance.algorithm_revision == RIGHTSIZING_ALGORITHM_REVISION
    assert observed.provenance.source_revision.startswith("agent-usage/v1:")
    assert observed.provenance.sample_interval_seconds == 300
    assert observed.classification == "increase"
    assert observed.reason_codes == ("current_pod_ownership_only",)
    assert observed.impact.cpu_millicores_change == 300
    assert observed.impact.memory_bytes_change == 256 * MEBIBYTE

    cpu, memory = observed.rows
    assert (cpu.container, cpu.resource, cpu.fit, cpu.action) == (
        "server",
        "cpu",
        "under_requested",
        "increase",
    )
    assert cpu.current_request is not None and cpu.current_request.value == 100
    assert cpu.observed_demand is not None and cpu.observed_demand.value == 200
    assert cpu.recommended_request is not None and cpu.recommended_request.value == 250
    assert cpu.sample_count == 72
    assert cpu.expected_samples == 2017
    assert cpu.confidence == "low"

    assert (memory.container, memory.resource, memory.fit, memory.action) == (
        "server",
        "memory",
        "under_requested",
        "increase",
    )
    assert memory.current_request is not None
    assert memory.current_request.value == 128 * MEBIBYTE
    assert memory.observed_demand is not None
    assert memory.observed_demand.value == 200 * MEBIBYTE
    assert memory.recommended_request is not None
    assert memory.recommended_request.value == 256 * MEBIBYTE


def test_projection_never_falls_back_to_labels_when_owner_evidence_is_incomplete() -> None:
    projection = project_rightsizing_workload(
        _workload(),
        dependents=_dependents(complete=False),
        usage_samples=_samples(),
        snapshot_complete=True,
    )

    assert projection.observation is None
    assert projection.has_data is False
    assert projection.reason_code == "workload_pod_ownership_incomplete"


def test_incomplete_container_history_produces_need_data_instead_of_zero_or_reduction() -> None:
    samples = _samples(count=71)
    samples[0]["usage"]["pods"]["shop/checkout-7f5c-b"] = {}  # type: ignore[index]

    projection = project_rightsizing_workload(
        _workload(),
        dependents=_dependents(),
        usage_samples=samples,
        snapshot_complete=True,
    )

    assert projection.observation is not None
    assert projection.has_data is True
    assert projection.observation.classification == "need_data"
    assert {row.action for row in projection.observation.rows} == {"need_data"}
    assert {row.fit for row in projection.observation.rows} == {"insufficient_history"}
    assert all(row.sample_count == 70 for row in projection.observation.rows)
    assert all("history_incomplete" in row.signals for row in projection.observation.rows)
    assert projection.observation.impact.cpu_millicores_change == 0
    assert projection.observation.impact.memory_bytes_change == 0


class _Result:
    def __init__(self, value: Any) -> None:
        self.value = value

    def mappings(self) -> _Result:
        return self

    def first(self) -> Any:
        return self.value

    def all(self) -> list[Any]:
        return self.value

    def scalar_one(self) -> Any:
        return self.value


class _Connection:
    def __init__(self, results: list[Any]) -> None:
        self.results = [_Result(value) for value in results]
        self.statements: list[str] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(str(statement).lower())
        return self.results.pop(0)


def test_repository_scan_reads_persisted_inventory_and_agent_usage_without_target_io() -> None:
    workload = _workload()
    revision, pod_a, pod_b = _dependents()
    connection = _Connection(
        [
            None,
            {
                "snapshot_id": "snapshot-current",
                "collected_at": datetime(2026, 7, 16, tzinfo=UTC),
                "summary": {
                    "summary": {
                        "resources_complete": True,
                        "collection_limits": {"truncated": False},
                    }
                },
            },
            1,
            [workload],
            [revision],
            [pod_a, pod_b],
            _samples(),
        ]
    )
    repository = object.__new__(InventoryRepository)

    @contextmanager
    def _connection() -> Iterator[_Connection]:
        yield connection

    repository.connection = _connection  # type: ignore[method-assign]

    result = repository.list_rightsizing_observations(
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        namespaces=("shop",),
        limit=20,
    )

    assert result is not None
    assert result["availability"] == "partial"
    assert result["coverage"] == {
        "workloads_discovered": 1,
        "workloads_evaluated": 1,
        "workloads_with_data": 1,
        "truncated": False,
    }
    assert result["workloads"][0]["resource"]["uid"] == "deployment-uid"
    assert result["workloads"][0]["classification"] == "increase"
    assert connection.results == []
    assert sum("cluster_inventory_snapshots" in sql for sql in connection.statements) == 1
    assert sum("cluster_usage_samples" in sql for sql in connection.statements) == 1
    assert sum("pg_advisory_xact_lock" in sql for sql in connection.statements) == 1
    assert all("prometheus" not in sql for sql in connection.statements)
