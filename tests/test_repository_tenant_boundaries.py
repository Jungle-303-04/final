"""Repository create/upsert tenant-boundary regression tests.

These tests intentionally exercise the storage contract directly.  The HTTP
create route already rejects an explicit ``repository_id`` in PR-0; the
repository must still generate an ID server-side and fence its conflict update
as defence in depth.
"""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from domains.applications.router import connect_application, upsert_application
from domains.gitops.repository import RepoChangeRepository, derive_repository_id
from packages.contracts.gateway.requests import ApplicationConnectRequest, ApplicationUpsertRequest
from packages.contracts.gateway.responses import RepositoryManifestValidationResponse


class _MappedResult:
    def __init__(self, row: dict[str, object] | None) -> None:
        self._row = row

    def mappings(self) -> _MappedResult:
        return self

    def first(self) -> dict[str, object] | None:
        return self._row


def _compiled(statement: Any) -> tuple[str, dict[str, object]]:
    compiled = statement.compile(dialect=postgresql.dialect())
    return " ".join(str(compiled).split()), dict(compiled.params)


class _ExistingRepositoryRouteDb:
    """Models the destructive path if a create route skips manage authorization."""

    def __init__(self, repository: dict[str, object]) -> None:
        self.repository = deepcopy(repository)
        self.lookup_calls: list[tuple[str, str]] = []
        self.access_checks: list[tuple[str, str, str, str, str]] = []
        self.repository_writes = 0
        self.owner_grants: list[tuple[str, str]] = []

    def get_repository_by_ref(self, workspace_id: str, repo_ref: str) -> dict[str, object] | None:
        self.lookup_calls.append((workspace_id, repo_ref))
        if (
            self.repository["workspace_id"] == workspace_id
            and self.repository["repo_ref"] == repo_ref
        ):
            return dict(self.repository)
        return None

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.access_checks.append((user_id, workspace_id, resource_type, resource_id, permission))
        return False

    def register_repository(self, payload: dict[str, object]) -> dict[str, object]:
        self.repository_writes += 1
        self.repository.update(
            {
                "default_branch": payload["default_branch"],
                "credential_ref": payload.get("credential_ref"),
                "access_policy": payload.get("access_policy", {}),
            }
        )
        self.owner_grants.append((str(payload["user_id"]), str(self.repository["repository_id"])))
        return dict(self.repository)

    def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
        return {**payload, "application_id": "app-existing"}

    def get_application(self, _workspace_id: str, _application_id: str) -> dict[str, object] | None:
        return None


def _attempt_existing_repository_create(db: _ExistingRepositoryRouteDb) -> HTTPException | None:
    session = SimpleNamespace(
        user_id="unauthorized-member",
        roles=("user",),
        workspace_id="workspace-a",
    )

    async def run() -> object:
        return await upsert_application(
            ApplicationUpsertRequest(
                name="attacker-app",
                repo_ref="acme/checkout",
                default_branch="attacker-branch",
            ),
            current=session,
            db=db,
        )

    try:
        asyncio.run(run())
    except HTTPException as exc:
        return exc
    return None


def test_repository_create_ignores_client_controlled_repository_id() -> None:
    statements: list[Any] = []
    payload = {
        "workspace_id": "workspace-a",
        "repo_ref": "acme/checkout",
        "repository_id": "repo-owned-by-workspace-b",
        "credential_ref": "db:github:workspace-a",
    }
    expected_repository_id = derive_repository_id(
        {
            "workspace_id": payload["workspace_id"],
            "repo_ref": payload["repo_ref"],
        }
    )

    class StubConnection:
        def execute(self, statement: Any) -> _MappedResult:
            statements.append(statement)
            _sql, params = _compiled(statement)
            return _MappedResult(params)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    stored = repository.register_repository(payload)

    _sql, params = _compiled(statements[0])
    assert params["repository_id"] == expected_repository_id
    assert stored["repository_id"] == expected_repository_id
    assert stored["repository_id"] != payload["repository_id"]


def test_same_workspace_existing_repository_requires_manage_before_create_upsert() -> None:
    repository_id = derive_repository_id(
        {"workspace_id": "workspace-a", "repo_ref": "acme/checkout"}
    )
    victim_row = {
        "repository_id": repository_id,
        "workspace_id": "workspace-a",
        "repo_ref": "acme/checkout",
        "default_branch": "main",
        "credential_ref": "db:github:victim-token",
        "access_policy": {"visibility": "private"},
    }
    db = _ExistingRepositoryRouteDb(victim_row)

    error = _attempt_existing_repository_create(db)

    assert error is not None
    assert error.status_code in {403, 404}
    assert db.repository == victim_row
    assert db.repository_writes == 0
    assert db.owner_grants == []
    assert db.lookup_calls == [("workspace-a", "acme/checkout")]
    assert any(
        resource_type == "repository"
        and resource_id == repository_id
        and permission.endswith(".manage")
        for _user, _workspace, resource_type, resource_id, permission in db.access_checks
    )


def test_legacy_repository_id_is_resolved_by_workspace_ref_before_manage_check() -> None:
    canonical_id = derive_repository_id(
        {"workspace_id": "workspace-a", "repo_ref": "acme/checkout"}
    )
    victim_row = {
        "repository_id": "repo-legacy-client-selected",
        "workspace_id": "workspace-a",
        "repo_ref": "acme/checkout",
        "default_branch": "main",
        "credential_ref": "db:github:legacy-token",
        "access_policy": {"visibility": "private"},
    }
    assert victim_row["repository_id"] != canonical_id
    db = _ExistingRepositoryRouteDb(victim_row)

    error = _attempt_existing_repository_create(db)

    assert error is not None
    assert error.status_code in {403, 404}
    assert db.lookup_calls == [("workspace-a", "acme/checkout")]
    assert db.repository == victim_row
    assert db.repository_writes == 0
    assert db.owner_grants == []
    assert any(
        resource_type == "repository"
        and resource_id == victim_row["repository_id"]
        and permission.endswith(".manage")
        for _user, _workspace, resource_type, resource_id, permission in db.access_checks
    )


def test_authorized_legacy_repository_upsert_reuses_stored_id_without_owner_regrant() -> None:
    victim_row = {
        "repository_id": "repo-legacy-client-selected",
        "workspace_id": "workspace-a",
        "provider": "github",
        "repo_ref": "acme/checkout",
        "default_branch": "main",
        "credential_ref": "db:github:legacy-token",
        "status": "active",
        "access_policy": {"visibility": "private"},
    }
    statements: list[Any] = []
    grants: list[tuple[object, ...]] = []

    class LegacyConnection:
        def execute(self, statement: Any) -> _MappedResult:
            statements.append(statement)
            if getattr(statement, "is_select", False):
                return _MappedResult(dict(victim_row))
            return _MappedResult(
                {
                    **victim_row,
                    "default_branch": "release",
                    "credential_ref": "db:github:rotated-token",
                }
            )

    @contextmanager
    def legacy_connection():
        yield LegacyConnection()

    @contextmanager
    def fake_unit_of_work():
        yield object()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = legacy_connection  # type: ignore[method-assign]
    repository.unit_of_work = fake_unit_of_work  # type: ignore[method-assign]
    repository.can_access = lambda *_args: True  # type: ignore[attr-defined]
    repository._grant_owner_if_present = lambda *args: grants.append(args)  # type: ignore[method-assign]

    stored = repository.register_repository(
        {
            "workspace_id": "workspace-a",
            "repo_ref": "acme/checkout",
            "default_branch": "release",
            "credential_ref": "db:github:rotated-token",
            "user_id": "repository-manager",
        }
    )

    assert getattr(statements[0], "is_select", False)
    select_sql, select_params = _compiled(statements[0])
    assert "git_repositories.workspace_id =" in select_sql
    assert "git_repositories.repo_ref =" in select_sql
    assert {"workspace-a", "acme/checkout"}.issubset(set(select_params.values()))

    insert_sql, insert_params = _compiled(statements[1])
    assert "ON CONFLICT (repository_id) DO UPDATE" in insert_sql
    assert insert_params["repository_id"] == victim_row["repository_id"]
    assert stored["repository_id"] == victim_row["repository_id"]
    assert grants == []


def test_application_create_with_foreign_repository_id_is_rejected_before_victim_write() -> None:
    victim_row = {
        "repository_id": "repo-owned-by-workspace-b",
        "workspace_id": "workspace-b",
        "repo_ref": "victim/payments",
        "credential_ref": "db:github:victim-token",
        "default_branch": "main",
    }

    class CrossWorkspaceDb:
        def __init__(self) -> None:
            self.victim = deepcopy(victim_row)

        def register_repository(self, payload: dict[str, object]) -> dict[str, object]:
            # This is the vulnerable behavior the router must never reach for a
            # client-controlled create ID.
            self.victim.update(
                {
                    "repo_ref": payload["repo_ref"],
                    "credential_ref": "db:github:attacker-token",
                }
            )
            return dict(self.victim)

        def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
            pytest.fail(f"application write must not run: {payload}")

    db = CrossWorkspaceDb()
    session = SimpleNamespace(
        user_id="attacker-a",
        roles=("user",),
        workspace_id="workspace-a",
    )

    async def run() -> object:
        return await upsert_application(
            ApplicationUpsertRequest(
                name="attacker-app",
                repo_ref="attacker/checkout",
                repository_id="repo-owned-by-workspace-b",
            ),
            current=session,
            db=db,
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    # PR-0's explicit-create-ID rejection remains the first boundary.  A
    # storage-layer ownership conflict is mapped to 404/409 only if reached by
    # a trusted internal/upsert path.
    assert exc.value.status_code == 422
    assert db.victim == victim_row


def test_server_generated_repository_collision_maps_to_non_disclosing_404() -> None:
    class CollisionDb:
        def register_repository(self, _payload: dict[str, object]) -> dict[str, object]:
            raise LookupError("foreign workspace repository repo-secret exists")

        def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
            pytest.fail(f"application write must not run after repository conflict: {payload}")

    session = SimpleNamespace(
        user_id="attacker-a",
        roles=("user",),
        workspace_id="workspace-a",
    )

    async def run() -> object:
        return await upsert_application(
            ApplicationUpsertRequest(name="attacker-app", repo_ref="attacker/checkout"),
            current=session,
            db=CollisionDb(),
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 404
    assert exc.value.detail == "repository not found"
    assert "repo-secret" not in str(exc.value.detail)


def test_connect_credential_write_joins_uow_and_rolls_back_on_repository_conflict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "repository-boundary-test-key")

    class ValidDiscovery:
        async def validate_manifest(self, payload: Any) -> RepositoryManifestValidationResponse:
            return RepositoryManifestValidationResponse(
                repo_ref=str(payload.repo_ref),
                branch=str(payload.branch),
                manifest_path=str(payload.manifest_path),
                valid=True,
                status="valid",
                validation_mode="static-parse",
                resource_count=1,
                resources=[],
                warnings=[],
                errors=[],
            )

    class TransactionalConnectDb:
        def __init__(self) -> None:
            self.in_uow = False
            self.events: list[tuple[str, bool]] = []
            self.credential: dict[str, object] | None = None

        @contextmanager
        def unit_of_work(self):
            previous_credential = deepcopy(self.credential)
            self.in_uow = True
            self.events.append(("uow_enter", self.in_uow))
            try:
                yield object()
            except BaseException:
                self.credential = previous_credential
                self.events.append(("uow_rollback", self.in_uow))
                raise
            finally:
                self.in_uow = False

        def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, object]:
            return {
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "settings": {"cluster_role": "target"},
            }

        def can_access(
            self,
            _user_id: str,
            _workspace_id: str,
            resource_type: str,
            _resource_id: str,
            permission: str,
        ) -> bool:
            return resource_type == "cluster" and permission == "deploy.run"

        def latest_cluster_agent_statuses(
            self, workspace_id: str, cluster_ids: set[str]
        ) -> dict[str, dict[str, object]]:
            return {
                cluster_id: {
                    "workspace_id": workspace_id,
                    "cluster_id": cluster_id,
                    "last_seen_at": datetime.now(UTC).isoformat(),
                }
                for cluster_id in cluster_ids
            }

        def get_repository_by_ref(
            self, _workspace_id: str, _repo_ref: str
        ) -> dict[str, object] | None:
            return None

        def upsert_workspace_credential(self, payload: dict[str, object]) -> None:
            self.events.append(("credential_write", self.in_uow))
            self.credential = dict(payload)

        def register_repository(self, _payload: dict[str, object]) -> dict[str, object]:
            self.events.append(("repository_conflict", self.in_uow))
            raise LookupError("foreign workspace repository exists")

        def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
            pytest.fail(f"application write must not run after conflict: {payload}")

    db = TransactionalConnectDb()
    session = SimpleNamespace(
        user_id="user-a",
        roles=("user",),
        workspace_id="workspace-a",
    )

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="checkout",
                repo_ref="acme/checkout",
                token="ghp_attacker-token",
                branch="main",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=ValidDiscovery(),
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 404
    assert db.events == [
        ("uow_enter", True),
        ("credential_write", True),
        ("repository_conflict", True),
        ("uow_rollback", True),
    ]
    assert db.credential is None


def test_repository_conflict_update_is_workspace_fenced_in_postgresql() -> None:
    statements: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> _MappedResult:
            statements.append(statement)
            _sql, params = _compiled(statement)
            return _MappedResult(params)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    repository.register_repository(
        {
            "workspace_id": "workspace-a",
            "repo_ref": "acme/checkout",
            "credential_ref": "db:github:workspace-a",
        }
    )

    sql, _params = _compiled(statements[0])
    assert "ON CONFLICT (repository_id) DO UPDATE" in sql
    assert "WHERE git_repositories.workspace_id = excluded.workspace_id" in sql
    assert "RETURNING" in sql


def test_cross_workspace_repository_conflict_is_rejected_without_credential_overwrite() -> None:
    attacker_payload = {
        "workspace_id": "workspace-a",
        "repo_ref": "acme/checkout",
        "credential_ref": "db:github:attacker-token",
        "default_branch": "attacker-branch",
    }
    collided_repository_id = derive_repository_id(attacker_payload)
    attacker_payload["repository_id"] = collided_repository_id
    victim_row = {
        "repository_id": collided_repository_id,
        "workspace_id": "workspace-b",
        "provider": "github",
        "repo_ref": "victim/payments",
        "default_branch": "main",
        "credential_ref": "db:github:victim-token",
        "status": "active",
        "access_policy": {"visibility": "private"},
    }
    rows = {collided_repository_id: deepcopy(victim_row)}

    class ConflictStoreConnection:
        def execute(self, statement: Any) -> _MappedResult:
            sql, params = _compiled(statement)
            repository_id = str(params["repository_id"])
            existing = rows.get(repository_id)
            if existing is None:
                rows[repository_id] = dict(params)
                return _MappedResult(rows[repository_id])

            same_workspace = existing["workspace_id"] == params["workspace_id"]
            workspace_fenced = "WHERE git_repositories.workspace_id = excluded.workspace_id" in sql
            if workspace_fenced and not same_workspace:
                return _MappedResult(None)

            # Regression model for an unguarded ON CONFLICT: mutable repository
            # fields, including credential_ref, would be overwritten.
            for field in (
                "provider",
                "repo_ref",
                "default_branch",
                "credential_ref",
                "status",
                "access_policy",
            ):
                existing[field] = params[field]
            return _MappedResult(existing)

    @contextmanager
    def conflict_store_connection():
        yield ConflictStoreConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = conflict_store_connection  # type: ignore[method-assign]

    error: LookupError | None = None
    try:
        repository.register_repository(attacker_payload)
    except LookupError as exc:
        error = exc

    assert rows[collided_repository_id] == victim_row
    assert error is not None
    assert "workspace" in str(error).lower()
