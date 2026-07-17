from __future__ import annotations

import asyncio
from contextlib import contextmanager
from datetime import UTC, datetime

import pytest
from sqlalchemy.dialects import postgresql

import domains.inventory.repository as inventory_repository
from domains.dashboard.ready_stream import InMemoryDashboardReadyFanout
from domains.identity.dependencies import ClusterAgentIdentity
from domains.inventory.change_correlation import correlate_inventory_timeline_events
from domains.inventory.ingest import append_inventory_timeline_events, ingest_inventory_snapshot
from domains.inventory.repository import (
    InventoryRepository,
    InventorySnapshotMutation,
    inventory_resource_key,
    inventory_timeline_events,
)
from domains.inventory.router import record_inventory_snapshot
from domains.inventory_filter.repository import InventoryFilterProjectionMutation
from domains.target.router import evidence_job_result
from domains.timeline.repository import TimelineLedgerAppend
from packages.contracts.gateway.requests import (
    EvidenceJobResultRequest,
    InventoryResource,
    InventorySnapshotRequest,
)


def _resource(
    *,
    inventory_key: str,
    name: str,
    uid: str | None = "uid-1",
    resource_version: str | None = "1",
    status: str = "Running",
) -> dict[str, object]:
    return {
        "inventory_key": inventory_key,
        "resource_type": "pod",
        "api_version": "v1",
        "kind": "Pod",
        "namespace": "payments",
        "name": name,
        "uid": uid,
        "resource_version": resource_version,
        "status": status,
        "health": "healthy",
        "labels": {"app": name},
        "annotations": {},
        "summary": {"phase": status},
        "raw": {"metadata": {"name": name, "resourceVersion": resource_version}},
    }


def test_complete_inventory_delta_only_emits_real_add_update_and_delete_changes() -> None:
    unchanged = _resource(inventory_key="unchanged", name="unchanged")
    changed_before = _resource(inventory_key="changed", name="changed", resource_version="1")
    changed_after = _resource(inventory_key="changed", name="changed", resource_version="2")
    deleted = _resource(inventory_key="deleted", name="deleted", uid=None)
    added = _resource(inventory_key="added", name="checkout-new", uid="pod-added")

    events = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=datetime(2026, 7, 15, tzinfo=UTC),
        previous_rows=[unchanged, changed_before, deleted],
        current_rows=[unchanged, changed_after, added],
        resources_complete=True,
    )

    assert [(event.event_type, event.native_id) for event in events] == [
        ("add", "added"),
        ("update", "changed"),
        ("delete", "deleted"),
    ]
    assert events[0].resource is not None
    assert events[0].resource.uid == "pod-added"
    assert events[2].resource is None
    assert events[2].subject.kind == "inventory_locator"
    assert events[0].title == "Pod checkout-new added"
    assert all("sequence" not in event.metadata for event in events)
    assert all("raw" not in event.metadata for event in events)
    retried_added = {**added, "snapshot_id": "a-different-generated-snapshot-id"}
    repeated = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=datetime(2026, 7, 15, tzinfo=UTC),
        previous_rows=[unchanged, changed_before, deleted],
        current_rows=[unchanged, changed_after, retried_added],
        resources_complete=True,
    )
    assert [(event.event_id, event.native_id) for event in repeated] == [
        (event.event_id, event.native_id) for event in events
    ]
    changed_again = _resource(inventory_key="changed", name="changed", resource_version="3")
    next_update = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=datetime(2026, 7, 15, 1, tzinfo=UTC),
        previous_rows=[changed_after],
        current_rows=[changed_again],
        resources_complete=True,
    )[0]
    assert next_update.native_id == events[1].native_id
    assert next_update.event_id != events[1].event_id


def test_incomplete_or_semantically_identical_inventory_snapshot_emits_no_timeline_events() -> None:
    previous = _resource(inventory_key="pod-1", name="checkout")
    same_resource = {**previous, "observed_at": datetime(2026, 7, 15, 1, tzinfo=UTC)}

    incomplete = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=datetime(2026, 7, 15, 2, tzinfo=UTC),
        previous_rows=[previous],
        current_rows=[],
        resources_complete=False,
    )
    identical = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=datetime(2026, 7, 15, 3, tzinfo=UTC),
        previous_rows=[previous],
        current_rows=[same_resource],
        resources_complete=True,
    )

    assert incomplete == ()
    assert identical == ()


def test_same_timestamp_inventory_cuts_keep_exact_snapshot_revision_and_version_ids() -> None:
    observed_at = datetime(2026, 7, 15, tzinfo=UTC)
    before = _resource(inventory_key="pod-1", name="checkout", resource_version="1")
    after = _resource(inventory_key="pod-1", name="checkout", resource_version="2")
    added = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=observed_at,
        previous_rows=[],
        current_rows=[before],
        resources_complete=True,
    )
    updated = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=observed_at,
        previous_rows=[before],
        current_rows=[after],
        resources_complete=True,
    )

    first = correlate_inventory_timeline_events(
        added,
        source_snapshot_id="snapshot-a",
        projection=InventoryFilterProjectionMutation(
            revision_id=10,
            version_ids_by_inventory_key={"pod-1": 100},
        ),
    )[0]
    second = correlate_inventory_timeline_events(
        updated,
        source_snapshot_id="snapshot-b",
        projection=InventoryFilterProjectionMutation(
            revision_id=11,
            version_ids_by_inventory_key={"pod-1": 101},
        ),
    )[0]

    assert first.occurred_at == second.occurred_at
    assert first.metadata == {
        "source_snapshot_id": "snapshot-a",
        "revision_id": 10,
        "version_id": 100,
    }
    assert second.metadata == {
        "source_snapshot_id": "snapshot-b",
        "revision_id": 11,
        "version_id": 101,
    }
    assert first.source_key != second.source_key
    assert first.event_id == first.source_key
    assert second.event_id == second.source_key


def test_repeated_a_b_a_b_inventory_transitions_keep_every_exact_cut() -> None:
    state_a = _resource(inventory_key="pod-1", name="checkout", resource_version="a")
    state_b = _resource(inventory_key="pod-1", name="checkout", resource_version="b")
    cuts = (
        ([], [state_a], "snapshot-1", 1, 101),
        ([state_a], [state_b], "snapshot-2", 2, 102),
        ([state_b], [state_a], "snapshot-3", 3, 103),
        ([state_a], [state_b], "snapshot-4", 4, 104),
    )

    events = tuple(
        correlate_inventory_timeline_events(
            inventory_timeline_events(
                workspace_id="workspace-1",
                cluster_id="cluster-1",
                observed_at=datetime(2026, 7, 15, revision_id, tzinfo=UTC),
                previous_rows=previous,
                current_rows=current,
                resources_complete=True,
            ),
            source_snapshot_id=snapshot_id,
            projection=InventoryFilterProjectionMutation(
                revision_id=revision_id,
                version_ids_by_inventory_key={"pod-1": version_id},
            ),
        )[0]
        for previous, current, snapshot_id, revision_id, version_id in cuts
    )

    assert [event.event_type for event in events] == ["add", "update", "update", "update"]
    assert len({event.source_key for event in events}) == 4
    assert events[1].source_key != events[3].source_key
    assert [event.metadata["revision_id"] for event in events] == [1, 2, 3, 4]


def test_large_inventory_mutation_uses_one_bulk_ledger_append() -> None:
    template = _mutation_with_add().timeline_events[0]
    events = tuple(
        template.model_copy(
            update={
                "event_id": f"event-{index}",
                "source_key": f"inventory:event-{index}",
                "native_id": f"pod-{index}",
            }
        )
        for index in range(5_000)
    )
    mutation = InventorySnapshotMutation(
        result=_mutation_with_add().result,
        timeline_events=events,
    )

    class BulkDb:
        def __init__(self) -> None:
            self.bulk_calls = 0

        def append_timeline_events(
            self, batch: tuple[object, ...]
        ) -> tuple[TimelineLedgerAppend, ...]:
            self.bulk_calls += 1
            assert len(batch) == 5_000
            return tuple(
                TimelineLedgerAppend(event=event, sequence=index, inserted=True)
                for index, event in enumerate(batch, start=1)
            )

        def append_timeline_event(self, _event: object) -> TimelineLedgerAppend:
            raise AssertionError("large inventory append must not use the per-event path")

    db = BulkDb()
    appends = append_inventory_timeline_events(db, mutation)

    assert db.bulk_calls == 1
    assert len(appends) == 5_000


def test_derived_health_and_usage_rollups_do_not_become_inventory_timeline_facts() -> None:
    health = {
        **_resource(inventory_key="health", name="cluster", uid=None),
        "resource_type": "health",
        "kind": "ClusterHealth",
    }
    usage = {
        **_resource(inventory_key="usage", name="cluster", uid=None),
        "resource_type": "usage",
        "kind": "ClusterUsage",
    }

    events = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=datetime(2026, 7, 15, tzinfo=UTC),
        previous_rows=[],
        current_rows=[health, usage],
        resources_complete=True,
    )

    assert events == ()


class _Result:
    def __init__(
        self, *, scalar: object = None, rows: list[dict[str, object]] | None = None
    ) -> None:
        self._scalar = scalar
        self._rows = rows or []
        self.rowcount = 0

    def scalar_one_or_none(self) -> object:
        return self._scalar

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict[str, object]]:
        return self._rows


class _RecordingInventoryConnection:
    def __init__(self, *, latest_observed_at: datetime | None = None) -> None:
        self.statements: list[object] = []
        self.latest_observed_at = latest_observed_at

    def execute(self, statement: object) -> _Result:
        self.statements.append(statement)
        sql = str(statement.compile(dialect=postgresql.dialect())).lower()
        if "pg_advisory_xact_lock" in sql:
            return _Result()
        if "max(cluster_inventory_snapshots.collected_at)" in sql:
            return _Result(scalar=self.latest_observed_at)
        if "from cluster_inventory_resources" in sql and sql.lstrip().startswith("select"):
            return _Result(rows=[])
        return _Result()


def test_snapshot_mutation_reads_prestate_under_inventory_lock_before_building_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _RecordingInventoryConnection()

    @contextmanager
    def connect():
        yield connection

    repository = object.__new__(InventoryRepository)
    repository.connection = connect
    monkeypatch.setattr(
        inventory_repository,
        "sync_inventory_filter_projection",
        lambda *_args, **_kwargs: InventoryFilterProjectionMutation(
            revision_id=7,
            version_ids_by_inventory_key={
                inventory_resource_key(
                    "workspace-1",
                    "cluster-1",
                    "pod",
                    "v1",
                    "payments",
                    "Pod",
                    "checkout",
                ): 19
            },
        ),
    )

    mutation = repository.save_inventory_snapshot_mutation(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        agent_id="agent-1",
        payload={
            "source": "cluster-agent",
            "collected_at": "2026-07-15T00:00:00Z",
            "replace": True,
            "summary": {"resources_complete": True, "labels_complete": True},
            "resources": [
                {
                    "resource_type": "pod",
                    "api_version": "v1",
                    "kind": "Pod",
                    "namespace": "payments",
                    "name": "checkout",
                    "uid": "pod-1",
                    "resource_version": "1",
                    "status": "Running",
                    "health": "healthy",
                }
            ],
        },
    )

    sql = [
        str(statement.compile(dialect=postgresql.dialect())).lower()
        for statement in connection.statements
    ]
    lock_index = next(index for index, item in enumerate(sql) if "pg_advisory_xact_lock" in item)
    prestate_index = next(
        index
        for index, item in enumerate(sql)
        if "from cluster_inventory_resources" in item and item.lstrip().startswith("select")
    )
    assert lock_index < prestate_index
    assert mutation.result["accepted"] is True
    assert [event.event_type for event in mutation.timeline_events] == ["add"]
    assert mutation.timeline_events[0].metadata == {
        "source_snapshot_id": mutation.result["snapshot_id"],
        "revision_id": 7,
        "version_id": 19,
    }


def test_stale_inventory_snapshot_creates_no_timeline_facts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _RecordingInventoryConnection(
        latest_observed_at=datetime(2026, 7, 15, 1, tzinfo=UTC)
    )

    @contextmanager
    def connect():
        yield connection

    repository = object.__new__(InventoryRepository)
    repository.connection = connect
    monkeypatch.setattr(
        inventory_repository, "sync_inventory_filter_projection", lambda *_args, **_kwargs: None
    )

    mutation = repository.save_inventory_snapshot_mutation(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        agent_id="agent-1",
        payload={
            "collected_at": "2026-07-15T00:00:00Z",
            "resources": [],
        },
    )

    assert mutation.result["accepted"] is False
    assert mutation.timeline_events == ()
    sql = [
        str(statement.compile(dialect=postgresql.dialect())).lower()
        for statement in connection.statements
    ]
    assert not any("from cluster_inventory_resources" in item for item in sql)


class _TransactionDb:
    def __init__(self, mutation: InventorySnapshotMutation) -> None:
        self.mutation = mutation
        self.steps: list[str] = []
        self.appended: list[TimelineLedgerAppend] = []

    @contextmanager
    def unit_of_work(self):
        self.steps.append("begin")
        try:
            yield self
        except Exception:
            self.steps.append("rollback")
            raise
        else:
            self.steps.append("commit")

    def save_inventory_snapshot_mutation(self, **_kwargs: object) -> InventorySnapshotMutation:
        self.steps.append("mutation")
        return self.mutation

    def append_timeline_event(self, event: object) -> TimelineLedgerAppend:
        self.steps.append("append")
        append = TimelineLedgerAppend(event=event, sequence=41, inserted=True)
        self.appended.append(append)
        return append


class _Fanout:
    def __init__(self, steps: list[str]) -> None:
        self.steps = steps
        self.published: list[TimelineLedgerAppend] = []

    async def publish_committed(self, append: TimelineLedgerAppend) -> None:
        self.steps.append("fanout")
        self.published.append(append)


def _mutation_with_add() -> InventorySnapshotMutation:
    event = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        observed_at=datetime(2026, 7, 15, tzinfo=UTC),
        previous_rows=[],
        current_rows=[_resource(inventory_key="pod-1", name="checkout")],
        resources_complete=True,
    )[0]
    return InventorySnapshotMutation(
        result={
            "accepted": True,
            "snapshot_id": "snapshot-1",
            "cluster_id": "cluster-1",
            "resource_count": 1,
            "marked_deleted": 0,
            "resource_types": ["pod"],
        },
        timeline_events=(event,),
    )


def _stale_mutation() -> InventorySnapshotMutation:
    return InventorySnapshotMutation(
        result={
            "accepted": False,
            "snapshot_id": "snapshot-stale",
            "cluster_id": "cluster-1",
            "resource_count": 0,
            "marked_deleted": 0,
            "resource_types": [],
        }
    )


def test_ingest_announces_only_after_the_unit_of_work_commits() -> None:
    async def run() -> None:
        db = _TransactionDb(_mutation_with_add())
        fanout = _Fanout(db.steps)

        result = await ingest_inventory_snapshot(
            db=db,
            workspace_id="workspace-1",
            cluster_id="cluster-1",
            agent_id="agent-1",
            payload={},
            fanout=fanout,
        )

        assert result["snapshot_id"] == "snapshot-1"
        assert db.steps == ["begin", "mutation", "append", "commit", "fanout"]
        assert fanout.published == db.appended

    asyncio.run(run())


def test_ingest_runs_atomic_dependencies_inside_its_owned_unit_of_work() -> None:
    async def run() -> None:
        db = _TransactionDb(_mutation_with_add())

        async def before_persist() -> None:
            db.steps.append("before")

        async def after_persist(_result: dict[str, object]) -> None:
            db.steps.append("after")

        await ingest_inventory_snapshot(
            db=db,
            workspace_id="workspace-1",
            cluster_id="cluster-1",
            agent_id="agent-1",
            payload={},
            before_persist=before_persist,
            after_persist=after_persist,
        )

        assert db.steps == ["begin", "before", "mutation", "append", "after", "commit"]

    asyncio.run(run())


def test_ingest_announces_dashboard_ready_after_commit_even_without_timeline_changes() -> None:
    async def run() -> None:
        mutation = InventorySnapshotMutation(
            result={
                "accepted": True,
                "snapshot_id": "snapshot-same-state",
                "cluster_id": "cluster-1",
                "resource_count": 1,
                "marked_deleted": 0,
                "resource_types": ["pod"],
            }
        )
        db = _TransactionDb(mutation)
        ready_fanout = InMemoryDashboardReadyFanout()
        subscription = await ready_fanout.subscribe("workspace-1", "cluster-1")

        await ingest_inventory_snapshot(
            db=db,
            workspace_id="workspace-1",
            cluster_id="cluster-1",
            agent_id="agent-1",
            payload={},
            ready_fanout=ready_fanout,
        )

        event = await asyncio.wait_for(subscription.next(), timeout=0.1)
        assert event.workspace_id == "workspace-1"
        assert event.cluster_id == "cluster-1"
        assert event.snapshot_id == "snapshot-same-state"
        assert db.steps == ["begin", "mutation", "commit"]

    asyncio.run(run())


def test_ingest_never_announces_dashboard_ready_for_a_stale_snapshot() -> None:
    async def run() -> None:
        db = _TransactionDb(_stale_mutation())
        ready_fanout = InMemoryDashboardReadyFanout()
        subscription = await ready_fanout.subscribe("workspace-1", "cluster-1")

        await ingest_inventory_snapshot(
            db=db,
            workspace_id="workspace-1",
            cluster_id="cluster-1",
            agent_id="agent-1",
            payload={},
            ready_fanout=ready_fanout,
        )

        with pytest.raises(TimeoutError):
            await asyncio.wait_for(subscription.next(), timeout=0.01)

    asyncio.run(run())


def test_ingest_rollback_never_announces_a_timeline_append() -> None:
    async def fail_after_persist(_result: dict[str, object]) -> None:
        raise RuntimeError("outbox staging failed")

    async def run() -> None:
        db = _TransactionDb(_mutation_with_add())
        fanout = _Fanout(db.steps)

        with pytest.raises(RuntimeError, match="outbox staging failed"):
            await ingest_inventory_snapshot(
                db=db,
                workspace_id="workspace-1",
                cluster_id="cluster-1",
                agent_id="agent-1",
                payload={},
                fanout=fanout,
                after_persist=fail_after_persist,
            )

        assert db.steps == ["begin", "mutation", "append", "rollback"]
        assert fanout.published == []

    asyncio.run(run())


class _InventoryEvents:
    def __init__(self, steps: list[str]) -> None:
        self.steps = steps
        self.recorded: list[object] = []

    async def accept_body(self, body: object) -> None:
        self.steps.append("outbox")
        self.recorded.append(body)


def test_agent_snapshot_route_keeps_outbox_staging_inside_the_timeline_transaction() -> None:
    async def run() -> None:
        db = _TransactionDb(_mutation_with_add())
        events = _InventoryEvents(db.steps)
        fanout = _Fanout(db.steps)
        ready_fanout = InMemoryDashboardReadyFanout()
        ready_subscription = await ready_fanout.subscribe("workspace-1", "cluster-1")

        response = await record_inventory_snapshot(
            InventorySnapshotRequest(
                cluster_id="cluster-1",
                agent_id="agent-1",
                resources=[
                    InventoryResource(
                        resource_type="pod",
                        kind="Pod",
                        namespace="payments",
                        name="checkout",
                    )
                ],
            ),
            identity=ClusterAgentIdentity(workspace_id="workspace-1", cluster_id="cluster-1"),
            db=db,
            events=events,
            timeline_fanout=fanout,
            dashboard_ready_fanout=ready_fanout,
        )

        assert response.snapshot_id == "snapshot-1"
        assert len(events.recorded) == 1
        assert db.steps == ["begin", "mutation", "append", "outbox", "commit", "fanout"]
        assert (await ready_subscription.next()).snapshot_id == "snapshot-1"

    asyncio.run(run())


def test_agent_stale_snapshot_does_not_stage_a_recorded_outbox_event() -> None:
    async def run() -> None:
        db = _TransactionDb(_stale_mutation())
        events = _InventoryEvents(db.steps)
        fanout = _Fanout(db.steps)
        ready_fanout = InMemoryDashboardReadyFanout()
        ready_subscription = await ready_fanout.subscribe("workspace-1", "cluster-1")

        response = await record_inventory_snapshot(
            InventorySnapshotRequest(cluster_id="cluster-1", agent_id="agent-1"),
            identity=ClusterAgentIdentity(workspace_id="workspace-1", cluster_id="cluster-1"),
            db=db,
            events=events,
            timeline_fanout=fanout,
            dashboard_ready_fanout=ready_fanout,
        )

        assert response.accepted is False
        assert events.recorded == []
        assert db.steps == ["begin", "mutation", "commit"]
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(ready_subscription.next(), timeout=0.01)

    asyncio.run(run())


class _TargetEvidenceInventoryDb(_TransactionDb):
    def __init__(self, mutation: InventorySnapshotMutation) -> None:
        super().__init__(mutation)
        self.inventory_payloads: list[dict[str, object]] = []

    def complete_evidence_job(self, **kwargs: object) -> dict[str, object]:
        return {
            "job_id": str(kwargs["job_id"]),
            "evidence_key": "workspace-1:cluster-1:cluster-snapshot:window-1",
            "status": str(kwargs["status"]),
        }

    def save_cluster_agent_status(self, **_kwargs: object) -> None:
        return None

    def save_inventory_snapshot_mutation(self, **kwargs: object) -> InventorySnapshotMutation:
        self.inventory_payloads.append(dict(kwargs["payload"]))
        return super().save_inventory_snapshot_mutation(**kwargs)

    def get_evidence_window(self, _evidence_key: str) -> None:
        return None

    def evidence_payload_if_ready(self, _evidence_key: str) -> None:
        return None


def test_target_evidence_uses_the_common_ingest_boundary_without_partial_timeline_facts() -> None:
    async def run() -> None:
        mutation = InventorySnapshotMutation(
            result={
                "accepted": True,
                "snapshot_id": "snapshot-partial",
                "cluster_id": "cluster-1",
                "resource_count": 1,
                "marked_deleted": 0,
                "resource_types": ["pod"],
            }
        )
        db = _TargetEvidenceInventoryDb(mutation)
        fanout = _Fanout(db.steps)
        ready_fanout = InMemoryDashboardReadyFanout()
        ready_subscription = await ready_fanout.subscribe("workspace-1", "cluster-1")

        response = await evidence_job_result(
            "job-kubernetes",
            EvidenceJobResultRequest(
                agent_id="agent-1",
                lease_id="lease-1",
                status="completed",
                result={
                    "kubernetes": {
                        "cluster": {"collected_at": "2026-07-15T00:00:00Z"},
                        "pods": [{"name": "checkout", "namespace": "payments"}],
                    }
                },
            ),
            ClusterAgentIdentity(workspace_id="workspace-1", cluster_id="cluster-1"),
            db,
            object(),
            fanout,
            ready_fanout,
        )

        assert response.accepted is True
        assert db.inventory_payloads[0]["replace"] is False
        assert db.steps == ["begin", "mutation", "commit"]
        assert fanout.published == []
        assert (await ready_subscription.next()).snapshot_id == "snapshot-partial"

    asyncio.run(run())
