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
from packages.contracts.gateway.responses import (
    RepositoryBranchItem,
    RepositoryBranchListResponse,
    RepositoryManifestCandidate,
    RepositoryManifestCandidateListResponse,
    RepositoryManifestResource,
    RepositoryManifestValidationResponse,
    RepositoryProbeResponse,
)
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
        self.repository_writes: list[dict[str, Any]] = []
        self.application_writes: list[dict[str, Any]] = []
        self.watch_writes: list[dict[str, Any]] = []
        self.binding_writes: list[dict[str, Any]] = []

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

    def register_repository(self, payload: dict[str, Any]) -> dict[str, Any]:
        stored = {**deepcopy(payload), "repository_id": "repository-yaml-demo"}
        self.repository_writes.append(stored)
        return stored

    def upsert_application(self, payload: dict[str, Any]) -> dict[str, Any]:
        stored = {
            **deepcopy(payload),
            "application_id": f"application-{payload['name']}",
        }
        self.application_writes.append(stored)
        return stored

    def register_watch_target(self, payload: dict[str, Any]) -> dict[str, Any]:
        stored = deepcopy(payload)
        self.watch_writes.append(stored)
        return stored

    def register_deployment_binding(self, payload: dict[str, Any]) -> dict[str, Any]:
        stored = deepcopy(payload)
        self.binding_writes.append(stored)
        return stored


class TransactionalFakeDemoDatabase(FakeDemoDatabase):
    """Fail on nested units and restore all writes when the outer seed fails."""

    def __init__(self) -> None:
        super().__init__()
        self.unit_of_work_depth = 0

    @contextmanager
    def unit_of_work(self):
        if self.unit_of_work_depth:
            raise AssertionError("demo seed opened a nested unit of work")
        state = deepcopy(
            {key: value for key, value in vars(self).items() if key != "unit_of_work_depth"}
        )
        self.unit_of_work_depth = 1
        try:
            yield self
        except Exception:
            for key, value in state.items():
                setattr(self, key, value)
            raise
        finally:
            self.unit_of_work_depth = 0


class FailingTransactionalDemoDatabase(TransactionalFakeDemoDatabase):
    def register_deployment_binding(self, payload: dict[str, Any]) -> dict[str, Any]:
        if len(self.binding_writes) == 2:
            raise RuntimeError("demo binding write failed")
        return super().register_deployment_binding(payload)


class FakeRepositoryDiscovery:
    def __init__(
        self,
        *,
        reachable: bool = True,
        revision: str = "3bc4084ee8a0bff5bbee54cd6a826b1ecd10dbef",
        confirmed_revision: str | None = None,
    ) -> None:
        self.reachable = reachable
        self.revision = revision
        self.confirmed_revision = confirmed_revision or revision
        self.revision_calls = 0
        self.validation_requests: list[Any] = []

    async def probe_repository(self, _payload: Any) -> RepositoryProbeResponse:
        return RepositoryProbeResponse(
            repo_ref="jungle-303-04/yaml-demo",
            normalized_repo_ref="jungle-303-04/yaml-demo",
            valid=True,
            reachable=self.reachable,
            default_branch="main",
            private=False,
            errors=[] if self.reachable else ["unreachable"],
        )

    async def list_branches(self, repo_ref: str) -> RepositoryBranchListResponse:
        return RepositoryBranchListResponse(
            repo_ref=repo_ref,
            default_branch="main",
            branches=[RepositoryBranchItem(name="main", default=True)],
        )

    async def resolve_branch_revision(self, _repo_ref: str, _branch: str) -> str:
        self.revision_calls += 1
        return self.revision if self.revision_calls == 1 else self.confirmed_revision

    async def list_manifest_candidates(
        self, repo_ref: str, branch: str
    ) -> RepositoryManifestCandidateListResponse:
        return RepositoryManifestCandidateListResponse(
            repo_ref=repo_ref,
            branch=branch,
            candidates=[
                RepositoryManifestCandidate(
                    path="manifests/base/workloads.yaml",
                    source_type="raw-yaml",
                    display_name="workloads",
                ),
                RepositoryManifestCandidate(
                    path="manifests/overlays/dev",
                    source_type="kustomize",
                    display_name="dev",
                ),
                RepositoryManifestCandidate(
                    path="manifests/overlays/diagnostics",
                    source_type="kustomize",
                    display_name="diagnostics",
                ),
                RepositoryManifestCandidate(
                    path="charts/demo-app",
                    source_type="helm",
                    display_name="chart",
                ),
            ],
        )

    async def validate_manifest(self, payload: Any) -> RepositoryManifestValidationResponse:
        self.validation_requests.append(payload)
        return RepositoryManifestValidationResponse(
            repo_ref="jungle-303-04/yaml-demo",
            branch=payload.branch,
            manifest_path=payload.manifest_path,
            valid=True,
            status="valid",
            validation_mode=payload.source_type,
            resource_count={
                "manifests/base/workloads.yaml": 3,
                "manifests/overlays/dev": 14,
                "manifests/overlays/diagnostics": 15,
                "charts/demo-app": 2,
            }[payload.manifest_path],
            resources=[
                RepositoryManifestResource(
                    api_version="apps/v1",
                    kind="Deployment",
                    namespace="demo-shop",
                    name=payload.source_type,
                )
            ],
        )


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
    assert descriptor.gitops is not None
    assert descriptor.gitops.repo_ref == "jungle-303-04/yaml-demo"
    assert descriptor.gitops.revision == "3bc4084ee8a0bff5bbee54cd6a826b1ecd10dbef"
    assert descriptor.gitops.catalog_scenario_count == 17
    assert len(descriptor.gitops.sources) == 5
    assert {source.source_type for source in descriptor.gitops.sources} == {
        "raw-yaml",
        "kustomize",
        "helm",
    }
    assert descriptor.digest() == restored.digest()
    assert descriptor.seed_marker() == restored.seed_marker()


def test_runtime_owner_override_is_revalidated_and_bound_to_seed_marker() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    owner_user_id = "user-8c543a9f-bc2f-594e-928b-55f2246f43fe"

    overridden = load_descriptor(DEFAULT_DESCRIPTOR, owner_user_id=owner_user_id)
    restored = DemoWorkspaceDescriptor.model_validate_json(overridden.model_dump_json())
    db = FakeDemoDatabase()

    asyncio.run(
        seed_demo_workspace(
            db,
            overridden,
            events=FakeEvents(),
            discovery=FakeRepositoryDiscovery(),
        )
    )

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

    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    raw["gitops"]["sources"][0]["manifest_path"] = "../secret.yaml"
    unsafe_path = tmp_path / "unsafe-gitops-path.json"
    unsafe_path.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(unsafe_path)

    assert "repository-relative" in str(error.value)

    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    raw["gitops"]["sources"][0]["values_path"] = "values.yaml"
    invalid_values = tmp_path / "invalid-values-source.json"
    invalid_values.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(invalid_values)

    assert "only for Helm" in str(error.value)


def test_seed_uses_registration_inventory_event_contract_and_is_idempotent() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = TransactionalFakeDemoDatabase()
    events = FakeEvents()
    discovery = FakeRepositoryDiscovery()
    observed_at = datetime(2026, 7, 18, 1, 2, 3, tzinfo=UTC)

    first = asyncio.run(
        seed_demo_workspace(
            db,
            descriptor,
            events=events,
            discovery=discovery,
            observed_at=observed_at,
        )
    )
    second = asyncio.run(
        seed_demo_workspace(
            db,
            descriptor,
            events=events,
            discovery=discovery,
            observed_at=observed_at,
        )
    )

    assert first["action"] == "seeded"
    assert first["registration_written"] is True
    assert first["inventory_written"] is True
    assert second["action"] == "unchanged"
    assert len(db.registration_writes) == 1
    assert len(db.inventory_writes) == 1
    assert len(db.repository_writes) == 1
    assert len(db.application_writes) == 5
    assert len(db.watch_writes) == 5
    assert len(db.binding_writes) == 5
    assert len(discovery.validation_requests) == 5
    assert first["gitops_source_count"] == 5
    assert second["gitops_source_count"] == 5
    assert [
        request.values_path
        for request in discovery.validation_requests
        if request.values_path is not None
    ] == ["charts/demo-app/values-staging.yaml"]
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

    repository = db.repository_writes[0]
    assert repository["repo_ref"] == "jungle-303-04/yaml-demo"
    assert repository["default_branch"] == "main"
    assert repository["credential_ref"] is None
    assert repository["access_policy"][DEMO_SEED_MARKER_KEY] == descriptor.seed_marker()
    assert repository["access_policy"]["revision"] == descriptor.gitops.revision
    assert repository["access_policy"]["catalog_scenario_count"] == 17
    assert {application["metadata"]["source_type"] for application in db.application_writes} == {
        "raw-yaml",
        "kustomize",
        "helm",
    }
    helm_override = next(
        application
        for application in db.application_writes
        if application["name"] == "yaml-demo-helm-staging"
    )
    assert helm_override["metadata"]["values_path"] == ("charts/demo-app/values-staging.yaml")
    assert helm_override["deploy_policy"]["values_path"] == ("charts/demo-app/values-staging.yaml")
    assert all(binding["deploy_policy"]["read_only"] for binding in db.binding_writes)


def test_seed_rolls_back_inventory_and_gitops_when_one_binding_fails() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FailingTransactionalDemoDatabase()
    events = FakeEvents()

    with pytest.raises(RuntimeError, match="binding write failed"):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=events,
                discovery=FakeRepositoryDiscovery(),
            )
        )

    assert db.registration is None
    assert db.snapshot is None
    assert db.registration_writes == []
    assert db.inventory_writes == []
    assert db.repository_writes == []
    assert db.application_writes == []
    assert db.watch_writes == []
    assert db.binding_writes == []
    assert events.bodies == []


def test_seed_rejects_unreachable_demo_repository_before_any_write() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    with pytest.raises(RuntimeError, match="repository validation failed"):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=FakeEvents(),
                discovery=FakeRepositoryDiscovery(reachable=False),
            )
        )

    assert db.registration_writes == []
    assert db.inventory_writes == []
    assert db.repository_writes == []


def test_seed_rejects_unpinned_demo_repository_revision_before_any_write() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    with pytest.raises(RuntimeError, match="revision does not match"):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=FakeEvents(),
                discovery=FakeRepositoryDiscovery(revision="a" * 40),
            )
        )

    assert db.registration_writes == []
    assert db.inventory_writes == []
    assert db.repository_writes == []


def test_seed_rejects_repository_change_during_validation_before_any_write() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    with pytest.raises(RuntimeError, match="changed during source validation"):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=FakeEvents(),
                discovery=FakeRepositoryDiscovery(confirmed_revision="b" * 40),
            )
        )

    assert db.registration_writes == []
    assert db.inventory_writes == []
    assert db.repository_writes == []


def test_seed_rejects_missing_opt_in_before_any_write(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(DEMO_WORKSPACE_MUTATIONS_ENV)
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    with pytest.raises(RuntimeError, match=DEMO_WORKSPACE_MUTATIONS_ENV):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=FakeEvents(),
                discovery=FakeRepositoryDiscovery(),
            )
        )

    assert db.registration_writes == []
    assert db.inventory_writes == []


def test_seed_stages_inventory_event_through_gateway_outbox_contract() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeOutboxDemoDatabase()
    gateway = ApiEventGateway(OutboxRequiredPublisher(), db, DEMO_EVENT_SOURCE)

    asyncio.run(
        seed_demo_workspace(
            db,
            descriptor,
            events=gateway,
            discovery=FakeRepositoryDiscovery(),
        )
    )

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
