from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy import (
    JSON,
    Column,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    func,
    select,
)
from sqlalchemy import event as sqlalchemy_event

import domains.demo_workspace.repository as demo_repository_module
from controller.demo_workspace import (
    DEFAULT_DESCRIPTOR,
    DEMO_EVENT_SOURCE,
    OutboxRequiredPublisher,
    load_descriptor,
    reset_demo_workspace,
    seed_demo_workspace,
)
from domains.demo_workspace.policy import (
    DEMO_WORKSPACE_MUTATIONS_ENV,
    DEMO_WORKSPACE_MUTATIONS_OPT_IN,
)
from domains.demo_workspace.repository import DemoWorkspaceRepository
from domains.inventory.events import InventorySnapshotRecordedBody
from domains.inventory.repository import snapshot_resources
from domains.registry import Database
from packages.contracts.demo_workspace import DEMO_SEED_MARKER_KEY, DemoWorkspaceDescriptor
from packages.runtime.gateway import ApiEventGateway


class FakeEvents:
    def __init__(self) -> None:
        self.bodies: list[object] = []

    async def accept_body(self, body: object) -> None:
        self.bodies.append(body)


class FakeDemoDatabase:
    def __init__(self) -> None:
        self.registration: dict[str, Any] | None = None
        self.snapshot: dict[str, Any] | None = None
        self.registration_writes: list[dict[str, Any]] = []
        self.inventory_writes: list[dict[str, Any]] = []
        self.reset_calls: list[dict[str, Any]] = []

    def get_cluster_registration(self, _workspace_id: str, _cluster_id: str) -> object:
        return self.registration

    def latest_inventory_snapshot(self, _workspace_id: str, _cluster_id: str) -> object:
        return self.snapshot

    def register_target_cluster(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.registration_writes.append(deepcopy(payload))
        self.registration = deepcopy(payload)
        return payload

    def save_inventory_snapshot(self, **kwargs: Any) -> dict[str, Any]:
        payload = deepcopy(kwargs["payload"])
        self.inventory_writes.append(payload)
        resources = snapshot_resources(payload)
        result = {
            "accepted": True,
            "snapshot_id": "snapshot-demo-v1",
            "cluster_id": kwargs["cluster_id"],
            "resource_count": len(resources),
            "marked_deleted": 0,
            "resource_types": sorted({str(item["resource_type"]) for item in resources}),
        }
        self.snapshot = {
            "snapshot_id": result["snapshot_id"],
            "summary": {
                "summary": payload["summary"],
                "health": payload["health"],
                "usage": payload["usage"],
            },
        }
        return result

    def reset_demo_workspace(self, **kwargs: Any) -> dict[str, int]:
        self.reset_calls.append(deepcopy(kwargs))
        return {"cluster_inventory_snapshots": 1, "workspaces": 1}


class FakeOutboxDemoDatabase(FakeDemoDatabase):
    def __init__(self) -> None:
        super().__init__()
        self.recorded_events: list[Any] = []
        self.staged_events: list[Any] = []

    @contextmanager
    def unit_of_work(self):
        yield self

    def record_event(self, event: Any) -> None:
        self.recorded_events.append(event)

    def stage_events(self, connection: object, events: list[Any]) -> None:
        assert connection is self
        self.staged_events.extend(events)


@pytest.fixture(autouse=True)
def allow_demo_mutations(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(DEMO_WORKSPACE_MUTATIONS_ENV, DEMO_WORKSPACE_MUTATIONS_OPT_IN)


def test_v1_descriptor_is_dedicated_complete_and_digest_stable() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    restored = DemoWorkspaceDescriptor.model_validate_json(descriptor.model_dump_json())

    assert descriptor.schema_version == 1
    assert descriptor.workspace.workspace_id != "default"
    assert descriptor.inventory.summary["resources_complete"] is True
    assert descriptor.inventory.summary["labels_complete"] is True
    assert descriptor.digest() == restored.digest()
    assert descriptor.seed_marker() == restored.seed_marker()


def test_runtime_owner_override_is_revalidated_and_bound_to_seed_marker() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    owner_user_id = "user-8c543a9f-bc2f-594e-928b-55f2246f43fe"

    overridden = load_descriptor(DEFAULT_DESCRIPTOR, owner_user_id=owner_user_id)
    restored = DemoWorkspaceDescriptor.model_validate_json(overridden.model_dump_json())
    db = FakeDemoDatabase()

    asyncio.run(seed_demo_workspace(db, overridden, events=FakeEvents()))

    assert overridden.workspace.workspace_id == descriptor.workspace.workspace_id
    assert overridden.workspace.owner_user_id == owner_user_id
    assert overridden.digest() != descriptor.digest()
    assert overridden.seed_marker() == restored.seed_marker()
    assert db.registration_writes[0]["user_id"] == owner_user_id
    assert db.registration_writes[0]["settings"][DEMO_SEED_MARKER_KEY] == overridden.seed_marker()

    with pytest.raises(ValidationError, match="owner_user_id"):
        load_descriptor(DEFAULT_DESCRIPTOR, owner_user_id=" invalid owner ")


def test_descriptor_rejects_default_workspace_and_incomplete_inventory(tmp_path: Path) -> None:
    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    raw["workspace"]["workspace_id"] = "default"
    default_path = tmp_path / "default.json"
    default_path.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(default_path)

    assert "dedicated non-default workspace" in str(error.value)

    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    raw["inventory"]["summary"]["resources_complete"] = False
    incomplete_path = tmp_path / "incomplete.json"
    incomplete_path.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(incomplete_path)

    assert "resources_complete" in str(error.value)


def test_seed_uses_registration_inventory_event_contract_and_is_idempotent() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()
    events = FakeEvents()
    observed_at = datetime(2026, 7, 18, 1, 2, 3, tzinfo=UTC)

    first = asyncio.run(seed_demo_workspace(db, descriptor, events=events, observed_at=observed_at))
    second = asyncio.run(
        seed_demo_workspace(db, descriptor, events=events, observed_at=observed_at)
    )

    assert first["action"] == "seeded"
    assert first["registration_written"] is True
    assert first["inventory_written"] is True
    assert second["action"] == "unchanged"
    assert len(db.registration_writes) == 1
    assert len(db.inventory_writes) == 1
    assert db.registration_writes[0]["settings"][DEMO_SEED_MARKER_KEY] == (descriptor.seed_marker())
    assert db.inventory_writes[0]["summary"][DEMO_SEED_MARKER_KEY] == (descriptor.seed_marker())
    assert db.inventory_writes[0]["collected_at"] == observed_at.isoformat()
    assert len(events.bodies) == 1
    body = events.bodies[0]
    assert isinstance(body, InventorySnapshotRecordedBody)
    assert body.workspace_id == descriptor.workspace.workspace_id
    assert body.cluster_id == descriptor.cluster.cluster_id
    assert body.snapshot_id == "snapshot-demo-v1"
    assert body.resource_count == 6


def test_seed_rejects_missing_opt_in_before_any_write(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(DEMO_WORKSPACE_MUTATIONS_ENV)
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    with pytest.raises(RuntimeError, match=DEMO_WORKSPACE_MUTATIONS_ENV):
        asyncio.run(seed_demo_workspace(db, descriptor, events=FakeEvents()))

    assert db.registration_writes == []
    assert db.inventory_writes == []


def test_seed_stages_inventory_event_through_gateway_outbox_contract() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeOutboxDemoDatabase()
    gateway = ApiEventGateway(OutboxRequiredPublisher(), db, DEMO_EVENT_SOURCE)

    asyncio.run(seed_demo_workspace(db, descriptor, events=gateway))

    assert len(db.recorded_events) == 1
    assert db.staged_events == db.recorded_events
    event = db.staged_events[0]
    assert event.source == DEMO_EVENT_SOURCE
    assert event.workspace_id == descriptor.workspace.workspace_id
    assert (
        event.payload
        == InventorySnapshotRecordedBody(
            workspace_id=descriptor.workspace.workspace_id,
            cluster_id=descriptor.cluster.cluster_id,
            snapshot_id="snapshot-demo-v1",
            agent_id=descriptor.cluster.agent_id,
            resource_count=6,
            resource_types=["health", "node", "pod", "service", "usage", "workload"],
        ).to_body()
    )


def test_reset_passes_exact_descriptor_marker_to_repository_boundary() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    result = reset_demo_workspace(db, descriptor)

    assert result["action"] == "reset"
    assert result["deleted"] == {"cluster_inventory_snapshots": 1, "workspaces": 1}
    assert db.reset_calls == [
        {
            "workspace_id": descriptor.workspace.workspace_id,
            "cluster_id": descriptor.cluster.cluster_id,
            "expected_marker": descriptor.seed_marker(),
            "event_source": DEMO_EVENT_SOURCE,
        }
    ]


def test_direct_broker_fallback_is_fail_closed() -> None:
    with pytest.raises(RuntimeError, match="database outbox"):
        asyncio.run(OutboxRequiredPublisher().emit("subject", "source", {}))


def test_database_composition_exposes_demo_reset_repository() -> None:
    assert DemoWorkspaceRepository in Database.__mro__
    assert Database.reset_demo_workspace is DemoWorkspaceRepository.reset_demo_workspace


def test_sqlite_reset_deletes_children_before_parents_and_preserves_other_scopes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    schema = _demo_reset_test_schema()
    engine = create_engine("sqlite+pysqlite:///:memory:")

    @sqlalchemy_event.listens_for(engine, "connect")
    def enable_foreign_keys(connection: Any, _record: object) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    schema.create_all(engine)
    marker = {"descriptor_id": "opsia-ui-demo.v1", "schema_version": 1, "digest": "a" * 64}
    _insert_reset_test_rows(schema, engine, marker)
    repository = object.__new__(DemoWorkspaceRepository)

    @contextmanager
    def unit_of_work():
        with engine.begin() as connection:
            yield connection

    repository.unit_of_work = unit_of_work  # type: ignore[method-assign]
    monkeypatch.setattr(demo_repository_module, "metadata", schema)

    counts = repository.reset_demo_workspace(
        workspace_id="demo-workspace",
        cluster_id="demo-cluster",
        expected_marker=marker,
        event_source=DEMO_EVENT_SOURCE,
    )

    assert counts["event_processing"] == 1
    assert counts["events"] == 1
    assert counts["cluster_registrations"] == 1
    assert counts["cluster_inventory_snapshots"] == 1
    assert counts["outbox"] == 2
    assert counts["workspaces"] == 1
    assert counts["member_resource_roles"] == 1
    assert counts["resource_assignments"] == 1
    assert counts["group_members"] == 1
    assert counts["groups"] == 1
    assert counts["organization_members"] == 1
    assert counts["organizations"] == 1

    with engine.connect() as connection:
        for table_name in (
            "event_processing",
            "cluster_registrations",
            "cluster_inventory_snapshots",
            "outbox",
            "member_resource_roles",
            "resource_assignments",
            "group_members",
            "groups",
            "organization_members",
            "organizations",
        ):
            assert (
                connection.execute(
                    select(func.count()).select_from(schema.tables[table_name])
                ).scalar_one()
                == 0
            )
        assert (
            connection.execute(
                select(func.count()).select_from(schema.tables["workspaces"])
            ).scalar_one()
            == 1
        )
        remaining_events = connection.execute(
            select(schema.tables["events"].c.event_id).order_by(schema.tables["events"].c.event_id)
        ).scalars()
        assert list(remaining_events) == ["event-other-source"]


def test_sqlite_reset_marker_mismatch_rolls_back_without_deleting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    schema = _demo_reset_test_schema()
    engine = create_engine("sqlite+pysqlite:///:memory:")
    schema.create_all(engine)
    marker = {"descriptor_id": "opsia-ui-demo.v1", "schema_version": 1, "digest": "a" * 64}
    _insert_reset_test_rows(schema, engine, marker)
    repository = object.__new__(DemoWorkspaceRepository)

    @contextmanager
    def unit_of_work():
        with engine.begin() as connection:
            yield connection

    repository.unit_of_work = unit_of_work  # type: ignore[method-assign]
    monkeypatch.setattr(demo_repository_module, "metadata", schema)

    with pytest.raises(RuntimeError, match="persisted descriptor marker"):
        repository.reset_demo_workspace(
            workspace_id="demo-workspace",
            cluster_id="demo-cluster",
            expected_marker={**marker, "digest": "b" * 64},
            event_source=DEMO_EVENT_SOURCE,
        )

    with engine.connect() as connection:
        assert (
            connection.execute(
                select(func.count()).select_from(schema.tables["cluster_inventory_snapshots"])
            ).scalar_one()
            == 1
        )
        assert (
            connection.execute(
                select(func.count()).select_from(schema.tables["workspaces"])
            ).scalar_one()
            == 2
        )


def _demo_reset_test_schema() -> MetaData:
    schema = MetaData()
    Table("workspaces", schema, Column("workspace_id", String, primary_key=True))
    Table("organizations", schema, Column("organization_id", String, primary_key=True))
    Table(
        "organization_members",
        schema,
        Column("id", Integer, primary_key=True),
        Column("organization_id", ForeignKey("organizations.organization_id")),
        Column("user_id", String),
    )
    Table(
        "groups",
        schema,
        Column("group_id", String, primary_key=True),
        Column("organization_id", ForeignKey("organizations.organization_id")),
    )
    Table(
        "group_members",
        schema,
        Column("id", Integer, primary_key=True),
        Column("group_id", ForeignKey("groups.group_id")),
        Column("user_id", String),
    )
    Table(
        "resource_assignments",
        schema,
        Column("resource_assignment_id", String, primary_key=True),
        Column("organization_id", ForeignKey("organizations.organization_id")),
        Column("group_id", ForeignKey("groups.group_id")),
    )
    Table(
        "member_resource_roles",
        schema,
        Column("id", Integer, primary_key=True),
        Column(
            "resource_assignment_id",
            ForeignKey("resource_assignments.resource_assignment_id"),
        ),
    )
    Table(
        "cluster_registrations",
        schema,
        Column("id", Integer, primary_key=True),
        Column("workspace_id", ForeignKey("workspaces.workspace_id")),
        Column("cluster_id", String),
        Column("settings", JSON),
    )
    Table(
        "cluster_inventory_snapshots",
        schema,
        Column("snapshot_id", String, primary_key=True),
        Column("workspace_id", ForeignKey("workspaces.workspace_id")),
    )
    Table(
        "outbox",
        schema,
        Column("id", Integer, primary_key=True),
        Column("workspace_id", ForeignKey("workspaces.workspace_id")),
    )
    Table(
        "events",
        schema,
        Column("event_id", String, primary_key=True),
        Column("source", String),
        Column("payload", JSON),
    )
    Table(
        "event_processing",
        schema,
        Column("event_id", ForeignKey("events.event_id"), primary_key=True),
    )
    return schema


def _insert_reset_test_rows(
    schema: MetaData,
    engine: Any,
    marker: dict[str, object],
) -> None:
    tables = schema.tables
    with engine.begin() as connection:
        connection.execute(
            tables["workspaces"].insert(),
            [{"workspace_id": "demo-workspace"}, {"workspace_id": "live-workspace"}],
        )
        connection.execute(
            tables["organizations"].insert().values(organization_id="demo-workspace")
        )
        connection.execute(
            tables["organization_members"]
            .insert()
            .values(id=1, organization_id="demo-workspace", user_id="demo-user")
        )
        connection.execute(
            tables["groups"]
            .insert()
            .values(group_id="demo-group", organization_id="demo-workspace")
        )
        connection.execute(
            tables["group_members"]
            .insert()
            .values(id=1, group_id="demo-group", user_id="demo-user")
        )
        connection.execute(
            tables["resource_assignments"]
            .insert()
            .values(
                resource_assignment_id="demo-assignment",
                organization_id="demo-workspace",
                group_id="demo-group",
            )
        )
        connection.execute(
            tables["member_resource_roles"]
            .insert()
            .values(id=1, resource_assignment_id="demo-assignment")
        )
        connection.execute(
            tables["cluster_registrations"]
            .insert()
            .values(
                id=1,
                workspace_id="demo-workspace",
                cluster_id="demo-cluster",
                settings={DEMO_SEED_MARKER_KEY: marker},
            )
        )
        connection.execute(
            tables["cluster_inventory_snapshots"]
            .insert()
            .values(snapshot_id="demo-snapshot", workspace_id="demo-workspace")
        )
        connection.execute(
            tables["outbox"].insert(),
            [
                {"id": 1, "workspace_id": "demo-workspace"},
                {"id": 2, "workspace_id": "demo-workspace"},
            ],
        )
        connection.execute(
            tables["events"].insert(),
            [
                {
                    "event_id": "event-demo-seed",
                    "source": DEMO_EVENT_SOURCE,
                    "payload": {"workspace_id": "demo-workspace"},
                },
                {
                    "event_id": "event-other-source",
                    "source": "another-service",
                    "payload": {"workspace_id": "demo-workspace"},
                },
            ],
        )
        connection.execute(tables["event_processing"].insert().values(event_id="event-demo-seed"))
