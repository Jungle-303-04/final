from __future__ import annotations

import asyncio
from contextlib import contextmanager
from datetime import UTC, datetime

import pytest
from domains.inventory.ingest import ingest_inventory_snapshot
from sqlalchemy.dialects import postgresql

import domains.inventory.repository as inventory_repository
from domains.inventory.repository import (
    InventoryRepository,
    InventorySnapshotMutation,
    inventory_timeline_events,
)
from domains.timeline.repository import TimelineLedgerAppend


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
    added = _resource(inventory_key="added", name="added", uid="pod-added")

    events = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        snapshot_id="snapshot-1",
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
    assert all("sequence" not in event.metadata for event in events)
    assert all("raw" not in event.metadata for event in events)


def test_incomplete_or_semantically_identical_inventory_snapshot_emits_no_timeline_events() -> None:
    previous = _resource(inventory_key="pod-1", name="checkout")
    same_resource = {**previous, "observed_at": datetime(2026, 7, 15, 1, tzinfo=UTC)}

    incomplete = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        snapshot_id="snapshot-2",
        observed_at=datetime(2026, 7, 15, 2, tzinfo=UTC),
        previous_rows=[previous],
        current_rows=[],
        resources_complete=False,
    )
    identical = inventory_timeline_events(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        snapshot_id="snapshot-3",
        observed_at=datetime(2026, 7, 15, 3, tzinfo=UTC),
        previous_rows=[previous],
        current_rows=[same_resource],
        resources_complete=True,
    )

    assert incomplete == ()
    assert identical == ()


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
    def __init__(self) -> None:
        self.statements: list[object] = []

    def execute(self, statement: object) -> _Result:
        self.statements.append(statement)
        sql = str(statement.compile(dialect=postgresql.dialect())).lower()
        if "pg_advisory_xact_lock" in sql:
            return _Result()
        if "max(cluster_inventory_snapshots.collected_at)" in sql:
            return _Result()
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
    repository.connection = connect  # type: ignore[method-assign]
    monkeypatch.setattr(
        inventory_repository, "sync_inventory_filter_projection", lambda *_args, **_kwargs: None
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
        snapshot_id="snapshot-1",
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
