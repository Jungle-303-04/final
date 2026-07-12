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
from packages.security.credentials import encrypt_credential


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

    def __init__(
        self,
        repository: dict[str, object],
        *,
        bound_application_ids: tuple[str, ...] = ("app-bound",),
        application_manage: dict[str, bool] | None = None,
        dormant_repository_manage: bool = False,
        regrant_on_write: bool = True,
    ) -> None:
        self.repository = deepcopy(repository)
        self.bound_application_ids = bound_application_ids
        self.application_manage = application_manage or {}
        self.dormant_repository_manage = dormant_repository_manage
        self.regrant_on_write = regrant_on_write
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

    def list_repository_applications(
        self, workspace_id: str, repository_id: str
    ) -> list[dict[str, object]]:
        assert workspace_id == self.repository["workspace_id"]
        assert repository_id == self.repository["repository_id"]
        return [
            {
                "workspace_id": workspace_id,
                "repository_id": repository_id,
                "application_id": application_id,
            }
            for application_id in self.bound_application_ids
        ]

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.access_checks.append((user_id, workspace_id, resource_type, resource_id, permission))
        if resource_type == "repository":
            return self.dormant_repository_manage
        if resource_type == "application":
            return self.application_manage.get(resource_id, False)
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
        if self.regrant_on_write:
            self.owner_grants.append(
                (str(payload["user_id"]), str(self.repository["repository_id"]))
            )
        return dict(self.repository)

    def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
        return {**payload, "application_id": "app-existing"}

    def get_application(self, _workspace_id: str, _application_id: str) -> dict[str, object] | None:
        return None


class _ValidRepositoryDiscovery:
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


class _TokenAwareRepositoryDiscovery(_ValidRepositoryDiscovery):
    def __init__(self) -> None:
        self.tokens: list[str] = []

    def with_token(self, token: str) -> _TokenAwareRepositoryDiscovery:
        self.tokens.append(token)
        return self


class _ConnectDb:
    def __init__(
        self,
        *,
        workspace_id: str,
        repo_ref: str,
        repository_id: str,
        repository: dict[str, object] | None = None,
        credentials: dict[str, dict[str, object]] | None = None,
    ) -> None:
        self.workspace_id = workspace_id
        self.repo_ref = repo_ref
        self.repository_id = repository_id
        self.repository = deepcopy(repository) if repository is not None else None
        self.credentials = deepcopy(credentials or {})
        self.registered_payload: dict[str, object] | None = None

    @contextmanager
    def unit_of_work(self):
        yield object()

    def get_cluster_registration(
        self, requested_workspace_id: str, cluster_id: str
    ) -> dict[str, object]:
        return {
            "workspace_id": requested_workspace_id,
            "cluster_id": cluster_id,
            "settings": {"cluster_role": "target"},
        }

    def latest_cluster_agent_statuses(
        self, requested_workspace_id: str, cluster_ids: set[str]
    ) -> dict[str, dict[str, object]]:
        return {
            cluster_id: {
                "workspace_id": requested_workspace_id,
                "cluster_id": cluster_id,
                "last_seen_at": datetime.now(UTC).isoformat(),
            }
            for cluster_id in cluster_ids
        }

    def get_repository_by_ref(
        self, requested_workspace_id: str, requested_repo_ref: str
    ) -> dict[str, object] | None:
        if (
            self.repository is not None
            and requested_workspace_id == self.workspace_id
            and requested_repo_ref == self.repo_ref
        ):
            return dict(self.repository)
        return None

    def list_repository_applications(
        self, requested_workspace_id: str, requested_repository_id: str
    ) -> list[dict[str, object]]:
        assert requested_workspace_id == self.workspace_id
        assert requested_repository_id == self.repository_id
        return [{"application_id": "app-existing"}]

    def can_access(
        self,
        _user_id: str,
        _requested_workspace_id: str,
        resource_type: str,
        _resource_id: str,
        permission: str,
    ) -> bool:
        return (resource_type, permission) in {
            ("cluster", "deploy.run"),
            ("repository", "repository.manage"),
            ("application", "application.manage"),
        }

    def upsert_workspace_credential(self, payload: dict[str, object]) -> None:
        self.credentials[str(payload["scope"])] = dict(payload)

    def get_workspace_credential(
        self,
        requested_workspace_id: str,
        provider: str,
        scope: str,
    ) -> dict[str, object] | None:
        if requested_workspace_id != self.workspace_id or provider != "github":
            return None
        credential = self.credentials.get(scope)
        return dict(credential) if credential is not None else None

    def register_repository(self, payload: dict[str, object]) -> dict[str, object]:
        self.registered_payload = dict(payload)
        if self.repository is None:
            return {**payload, "repository_id": self.repository_id}
        self.repository["credential_ref"] = payload.get("credential_ref")
        return dict(self.repository)

    def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
        application_id = "app-existing" if self.repository is not None else "app-new"
        return {
            **payload,
            "application_id": application_id,
            "repository_id": self.repository_id,
        }

    def get_application(
        self, _requested_workspace_id: str, _application_id: str
    ) -> dict[str, object] | None:
        return None

    def register_watch_target(self, _payload: dict[str, object]) -> None:
        return None

    def register_deployment_binding(self, _payload: dict[str, object]) -> None:
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
            if getattr(statement, "is_select", False):
                return _MappedResult(None)
            _sql, params = _compiled(statement)
            return _MappedResult(params)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    repository.unit_of_work = stub_connection  # type: ignore[method-assign]

    stored = repository.register_repository(payload)

    _sql, params = _compiled(statements[-1])
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
    db = _ExistingRepositoryRouteDb(
        victim_row,
        bound_application_ids=("app-allowed", "app-denied"),
        application_manage={"app-allowed": True, "app-denied": False},
        dormant_repository_manage=True,
    )

    error = _attempt_existing_repository_create(db)

    assert error is not None
    assert error.status_code in {403, 404}
    assert db.repository == victim_row
    assert db.repository_writes == 0
    assert db.owner_grants == []
    assert db.lookup_calls == [("workspace-a", "acme/checkout")]
    assert {
        (resource_type, resource_id, permission)
        for _user, _workspace, resource_type, resource_id, permission in db.access_checks
    } == {
        ("application", "app-allowed", "application.manage"),
        ("application", "app-denied", "application.manage"),
    }


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
    db = _ExistingRepositoryRouteDb(
        victim_row,
        bound_application_ids=("legacy-app",),
        application_manage={"legacy-app": False},
        dormant_repository_manage=True,
    )

    error = _attempt_existing_repository_create(db)

    assert error is not None
    assert error.status_code in {403, 404}
    assert db.lookup_calls == [("workspace-a", "acme/checkout")]
    assert db.repository == victim_row
    assert db.repository_writes == 0
    assert db.owner_grants == []
    assert {
        (resource_type, resource_id, permission)
        for _user, _workspace, resource_type, resource_id, permission in db.access_checks
    } == {("application", "legacy-app", "application.manage")}


def test_all_bound_application_managers_can_update_without_dormant_repository_role() -> None:
    victim_row = {
        "repository_id": "repo-existing",
        "workspace_id": "workspace-a",
        "repo_ref": "acme/checkout",
        "default_branch": "main",
        "credential_ref": "db:github:repo-existing",
        "access_policy": {"visibility": "private"},
    }
    db = _ExistingRepositoryRouteDb(
        victim_row,
        bound_application_ids=("app-one", "app-two"),
        application_manage={"app-one": True, "app-two": True},
        dormant_repository_manage=False,
        regrant_on_write=False,
    )

    error = _attempt_existing_repository_create(db)

    assert error is None
    assert db.repository_writes == 1
    assert db.repository["credential_ref"] == victim_row["credential_ref"]
    assert db.owner_grants == []
    assert {
        (resource_type, resource_id, permission)
        for _user, _workspace, resource_type, resource_id, permission in db.access_checks
    } == {
        ("application", "app-one", "application.manage"),
        ("application", "app-two", "application.manage"),
    }


def test_existing_repository_without_bound_application_is_admin_only() -> None:
    victim_row = {
        "repository_id": "repo-orphan",
        "workspace_id": "workspace-a",
        "repo_ref": "acme/checkout",
        "default_branch": "main",
        "credential_ref": "db:github:repo-orphan",
        "access_policy": {"visibility": "private"},
    }
    db = _ExistingRepositoryRouteDb(
        victim_row,
        bound_application_ids=(),
        dormant_repository_manage=True,
    )

    error = _attempt_existing_repository_create(db)

    assert error is not None
    assert error.status_code in {403, 404}
    assert db.repository == victim_row
    assert db.repository_writes == 0
    assert db.owner_grants == []
    assert db.access_checks == []


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
    repository.list_repository_applications = lambda *_args: [  # type: ignore[attr-defined]
        {"application_id": "legacy-app"}
    ]
    repository.can_access = (  # type: ignore[attr-defined]
        lambda _user, _workspace, resource_type, resource_id, permission: (
            resource_type == "application"
            and resource_id == "legacy-app"
            and permission == "application.manage"
        )
    )
    repository.is_service_admin = lambda _user_id: False  # type: ignore[attr-defined]
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

    lock_sql, _lock_params = _compiled(statements[0])
    assert "pg_advisory_xact_lock" in lock_sql
    select_sql, select_params = _compiled(statements[1])
    assert "git_repositories.workspace_id =" in select_sql
    assert "git_repositories.repo_ref =" in select_sql
    assert {"workspace-a", "acme/checkout"}.issubset(set(select_params.values()))

    insert_sql, insert_params = _compiled(statements[2])
    assert "ON CONFLICT (repository_id) DO UPDATE" in insert_sql
    assert insert_params["repository_id"] == victim_row["repository_id"]
    assert stored["repository_id"] == victim_row["repository_id"]
    assert grants == []


def test_authorized_repository_update_without_credential_field_preserves_existing_ref() -> None:
    victim_row = {
        "repository_id": "repo-existing",
        "workspace_id": "workspace-a",
        "provider": "github",
        "repo_ref": "acme/checkout",
        "default_branch": "main",
        "credential_ref": "db:github:repository:repo-existing",
        "status": "active",
        "access_policy": {"visibility": "private"},
    }
    statements: list[Any] = []

    class ExistingConnection:
        def execute(self, statement: Any) -> _MappedResult:
            statements.append(statement)
            if getattr(statement, "is_select", False):
                return _MappedResult(dict(victim_row))
            return _MappedResult(dict(victim_row))

    @contextmanager
    def existing_connection():
        yield ExistingConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = existing_connection  # type: ignore[method-assign]
    repository.unit_of_work = existing_connection  # type: ignore[method-assign]
    repository.list_repository_applications = lambda *_args: [  # type: ignore[attr-defined]
        {"application_id": "app-existing"}
    ]
    repository.can_access = lambda *_args: True  # type: ignore[attr-defined]
    repository.is_service_admin = lambda _user_id: False  # type: ignore[attr-defined]

    repository.register_repository(
        {
            "workspace_id": "workspace-a",
            "repo_ref": "acme/checkout",
            "default_branch": "release",
            "user_id": "repository-manager",
        }
    )

    update_sql, update_params = _compiled(statements[-1])
    assert "credential_ref = git_repositories.credential_ref" in update_sql
    assert update_params.get("credential_ref") is None


def test_repository_manage_composition_locks_identity_before_read() -> None:
    statements: list[Any] = []
    victim_row = {
        "repository_id": "repo-existing",
        "workspace_id": "workspace-a",
        "provider": "github",
        "repo_ref": "acme/checkout",
        "default_branch": "main",
        "credential_ref": None,
        "status": "active",
        "access_policy": {},
    }

    class LockOrderConnection:
        def execute(self, statement: Any) -> _MappedResult:
            statements.append(statement)
            sql = str(statement.compile(dialect=postgresql.dialect()))
            if "pg_advisory_xact_lock" in sql:
                return _MappedResult(None)
            if "FROM git_repositories" in sql:
                return _MappedResult(dict(victim_row))
            return _MappedResult(dict(victim_row))

    @contextmanager
    def lock_order_connection():
        yield LockOrderConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = lock_order_connection  # type: ignore[method-assign]
    repository.unit_of_work = lock_order_connection  # type: ignore[method-assign]
    repository.list_repository_applications = lambda *_args: [  # type: ignore[attr-defined]
        {"application_id": "app-existing"}
    ]
    repository.can_access = lambda *_args: True  # type: ignore[attr-defined]
    repository.is_service_admin = lambda _user_id: False  # type: ignore[attr-defined]

    repository.register_repository(
        {
            "workspace_id": "workspace-a",
            "repo_ref": "acme/checkout",
            "user_id": "manager-a",
        }
    )

    first_sql = str(statements[0].compile(dialect=postgresql.dialect()))
    second_sql = str(statements[1].compile(dialect=postgresql.dialect()))
    assert "pg_advisory_xact_lock" in first_sql
    assert "FROM git_repositories" in second_sql


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


def test_plain_application_create_cannot_register_new_repository_as_non_admin() -> None:
    writes: list[str] = []

    class PlainCreateDb:
        @contextmanager
        def unit_of_work(self):
            yield object()

        def get_repository_by_ref(
            self,
            _workspace_id: str,
            _repo_ref: str,
        ) -> dict[str, object] | None:
            return None

        def register_repository(self, _payload: dict[str, object]) -> dict[str, object]:
            writes.append("repository")
            return {"repository_id": "repo-new"}

        def upsert_application(self, _payload: dict[str, object]) -> dict[str, object]:
            writes.append("application")
            return {"application_id": "app-new"}

        def get_application(
            self,
            _workspace_id: str,
            _application_id: str,
        ) -> dict[str, object] | None:
            return None

    session = SimpleNamespace(user_id="user-a", roles=("user",), workspace_id="workspace-a")

    async def run() -> object:
        return await upsert_application(
            ApplicationUpsertRequest(
                name="private-target",
                repo_ref="acme/private-target",
            ),
            current=session,
            db=PlainCreateDb(),
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 403
    assert writes == []


def test_application_create_rejects_whitespace_repository_id_before_writes() -> None:
    class WriteSpyDb:
        def __init__(self) -> None:
            self.writes: list[str] = []

        def get_repository_by_ref(
            self, _workspace_id: str, _repo_ref: str
        ) -> dict[str, object] | None:
            return None

        def register_repository(self, payload: dict[str, object]) -> dict[str, object]:
            self.writes.append("repository")
            return {**payload, "repository_id": "repo-server"}

        def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
            self.writes.append("application")
            return {**payload, "application_id": "app-server"}

        def get_application(
            self, _workspace_id: str, _application_id: str
        ) -> dict[str, object] | None:
            return None

    db = WriteSpyDb()
    session = SimpleNamespace(user_id="user-a", roles=("user",), workspace_id="workspace-a")

    async def run() -> object:
        return await upsert_application(
            ApplicationUpsertRequest(
                name="checkout",
                repo_ref="acme/checkout",
                repository_id=" \t ",
            ),
            current=session,
            db=db,
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 422
    assert db.writes == []


def test_repo_less_existing_application_requires_manage_without_owner_regrant() -> None:
    victim_application = {
        "application_id": "app-repoless-existing",
        "workspace_id": "workspace-a",
        "repository_id": "repo-default-derived",
        "name": "legacy-app",
        "manifest_path": "deploy.yaml",
        "status": "active",
        "metadata": {"owner": "victim-team"},
    }

    class RepoLessApplicationDb:
        def __init__(self) -> None:
            self.application = deepcopy(victim_application)
            self.application_writes = 0
            self.owner_grants: list[tuple[str, str]] = []
            self.access_checks: list[tuple[str, str, str, str, str]] = []

        def get_application(
            self, workspace_id: str, _application_id: str
        ) -> dict[str, object] | None:
            if workspace_id == self.application["workspace_id"]:
                return dict(self.application)
            return None

        def get_application_by_identity(
            self,
            workspace_id: str,
            _repository_id: str,
            name: str,
        ) -> dict[str, object] | None:
            if (
                workspace_id == self.application["workspace_id"]
                and name == self.application["name"]
            ):
                return dict(self.application)
            return None

        def can_access(
            self,
            user_id: str,
            workspace_id: str,
            resource_type: str,
            resource_id: str,
            permission: str,
        ) -> bool:
            self.access_checks.append(
                (user_id, workspace_id, resource_type, resource_id, permission)
            )
            return False

        def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
            self.application_writes += 1
            self.application["metadata"] = dict(payload.get("metadata", {}))
            self.owner_grants.append(
                (str(payload["user_id"]), str(self.application["application_id"]))
            )
            return dict(self.application)

    db = RepoLessApplicationDb()
    session = SimpleNamespace(
        user_id="unauthorized-member",
        roles=("user",),
        workspace_id="workspace-a",
    )

    async def run() -> object:
        return await upsert_application(
            ApplicationUpsertRequest(
                name="legacy-app",
                repo_ref="",
                metadata={"owner": "attacker-team"},
            ),
            current=session,
            db=db,
        )

    error: HTTPException | None = None
    try:
        asyncio.run(run())
    except HTTPException as exc:
        error = exc

    assert error is not None
    assert error.status_code in {403, 404}
    assert db.application == victim_application
    assert db.application_writes == 0
    assert db.owner_grants == []
    assert any(
        resource_type == "application"
        and resource_id == victim_application["application_id"]
        and permission == "application.manage"
        for _user, _workspace, resource_type, resource_id, permission in db.access_checks
    )


def test_server_generated_repository_collision_maps_to_non_disclosing_404() -> None:
    class CollisionDb:
        def get_repository_by_ref(
            self, _workspace_id: str, _repo_ref: str
        ) -> dict[str, object] | None:
            return None

        def register_repository(self, _payload: dict[str, object]) -> dict[str, object]:
            raise LookupError("foreign workspace repository repo-secret exists")

        def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
            pytest.fail(f"application write must not run after repository conflict: {payload}")

    session = SimpleNamespace(
        user_id="attacker-a",
        roles=("service_admin",),
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
            discovery=_ValidRepositoryDiscovery(),
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


def test_new_repository_token_uses_per_repository_scope_without_rotating_other_repo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "per-repository-credential-test-key")
    workspace_id = "workspace-a"
    repo_ref = "acme/new-checkout"
    repository_id = derive_repository_id({"workspace_id": workspace_id, "repo_ref": repo_ref})
    db = _ConnectDb(
        workspace_id=workspace_id,
        repo_ref=repo_ref,
        repository_id=repository_id,
        credentials={
            "github": {
                "scope": "github",
                "encrypted_value": "fernet:v1:other-repository-token",
                "metadata": {"owner": "other-repository"},
            }
        },
    )
    original_other_credential = deepcopy(db.credentials["github"])
    session = SimpleNamespace(user_id="user-a", roles=("user",), workspace_id=workspace_id)

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="new-checkout",
                repo_ref=repo_ref,
                token="ghp_new-repository-token",
                branch="main",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=_ValidRepositoryDiscovery(),
        )

    asyncio.run(run())

    assert db.credentials["github"] == original_other_credential
    new_scopes = set(db.credentials) - {"github"}
    assert len(new_scopes) == 1
    new_scope = new_scopes.pop()
    assert repository_id in new_scope
    assert db.registered_payload is not None
    assert db.registered_payload["credential_ref"] == f"db:github:{new_scope}"


def test_connect_uses_explicit_token_for_manifest_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "explicit-token-validation-key")
    workspace_id = "workspace-a"
    repo_ref = "acme/private-checkout"
    repository_id = derive_repository_id({"workspace_id": workspace_id, "repo_ref": repo_ref})
    db = _ConnectDb(
        workspace_id=workspace_id,
        repo_ref=repo_ref,
        repository_id=repository_id,
    )
    discovery = _TokenAwareRepositoryDiscovery()
    session = SimpleNamespace(user_id="user-a", roles=("user",), workspace_id=workspace_id)

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="private-checkout",
                repo_ref=repo_ref,
                token="ghp_request-scoped",
                branch="main",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=discovery,
        )

    asyncio.run(run())

    assert discovery.tokens == ["ghp_request-scoped"]


def test_new_repository_without_token_strips_ambient_discovery_credential() -> None:
    workspace_id = "workspace-a"
    repo_ref = "acme/public-checkout"
    repository_id = derive_repository_id({"workspace_id": workspace_id, "repo_ref": repo_ref})
    db = _ConnectDb(
        workspace_id=workspace_id,
        repo_ref=repo_ref,
        repository_id=repository_id,
    )
    discovery = _TokenAwareRepositoryDiscovery()
    session = SimpleNamespace(user_id="user-a", roles=("user",), workspace_id=workspace_id)

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="public-checkout",
                repo_ref=repo_ref,
                branch="main",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=discovery,
        )

    asyncio.run(run())

    assert discovery.tokens == [""]
    assert db.registered_payload is not None
    assert db.registered_payload["credential_ref"] == "public:anonymous"


def test_existing_repository_denial_happens_before_manifest_http() -> None:
    workspace_id = "workspace-a"
    repo_ref = "acme/existing-private"
    repository_id = "repo-existing-private"

    class DeniedExistingRepositoryDb(_ConnectDb):
        def can_access(
            self,
            _user_id: str,
            _workspace_id: str,
            resource_type: str,
            _resource_id: str,
            permission: str,
        ) -> bool:
            if (resource_type, permission) == ("cluster", "deploy.run"):
                return True
            if (resource_type, permission) == ("application", "application.manage"):
                return False
            return False

    class ForbiddenDiscovery:
        async def validate_manifest(self, _payload: Any) -> object:
            pytest.fail("manifest HTTP must not run before repository authorization")

    db = DeniedExistingRepositoryDb(
        workspace_id=workspace_id,
        repo_ref=repo_ref,
        repository_id=repository_id,
        repository={
            "workspace_id": workspace_id,
            "repository_id": repository_id,
            "repo_ref": repo_ref,
            "credential_ref": "db:github:repository:repo-existing-private",
        },
    )
    session = SimpleNamespace(user_id="user-a", roles=("user",), workspace_id=workspace_id)

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="existing-private",
                repo_ref=repo_ref,
                branch="main",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=ForbiddenDiscovery(),  # type: ignore[arg-type]
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code in {403, 404}


def test_existing_repository_alias_cannot_bypass_manage_preflight() -> None:
    workspace_id = "workspace-a"
    stored_repo_ref = "acme/existing-private"
    repository_id = "repo-existing-private"

    class DeniedExistingRepositoryDb(_ConnectDb):
        def can_access(
            self,
            _user_id: str,
            _workspace_id: str,
            resource_type: str,
            _resource_id: str,
            permission: str,
        ) -> bool:
            return (resource_type, permission) == ("cluster", "deploy.run")

    class ForbiddenDiscovery:
        async def validate_manifest(self, _payload: Any) -> object:
            pytest.fail("case alias must be denied before manifest HTTP")

    db = DeniedExistingRepositoryDb(
        workspace_id=workspace_id,
        repo_ref=stored_repo_ref,
        repository_id=repository_id,
        repository={
            "workspace_id": workspace_id,
            "repository_id": repository_id,
            "repo_ref": stored_repo_ref,
            "credential_ref": "db:github:repository:repo-existing-private",
        },
    )
    session = SimpleNamespace(user_id="user-a", roles=("user",), workspace_id=workspace_id)

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="existing-private",
                repo_ref="ACME/EXISTING-PRIVATE.git",
                branch="main",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=ForbiddenDiscovery(),  # type: ignore[arg-type]
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code in {403, 404}
    assert db.registered_payload is None


def test_admin_connect_uses_wizard_credential_for_manifest_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "wizard-validation-key")
    workspace_id = "workspace-a"
    repo_ref = "acme/wizard-private"
    repository_id = derive_repository_id({"workspace_id": workspace_id, "repo_ref": repo_ref})
    scope = f"repository:{repository_id}"
    db = _ConnectDb(
        workspace_id=workspace_id,
        repo_ref=repo_ref,
        repository_id=repository_id,
        credentials={
            scope: {
                "workspace_id": workspace_id,
                "provider": "github",
                "scope": scope,
                "encrypted_value": encrypt_credential("ghp_wizard-scoped"),
                "metadata": {"repository_id": repository_id},
            }
        },
    )
    discovery = _TokenAwareRepositoryDiscovery()
    session = SimpleNamespace(
        user_id="admin-a",
        roles=("service_admin",),
        workspace_id=workspace_id,
    )

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="wizard-private",
                repo_ref=repo_ref,
                branch="main",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=discovery,
        )

    asyncio.run(run())

    assert discovery.tokens == ["ghp_wizard-scoped"]


def test_existing_repository_without_token_preserves_credential_ref(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "existing-credential-test-key")
    workspace_id = "workspace-a"
    repo_ref = "acme/existing-checkout"
    repository_id = "repo-existing-checkout"
    existing_credential_ref = "db:github:repo-existing-checkout"
    db = _ConnectDb(
        workspace_id=workspace_id,
        repo_ref=repo_ref,
        repository_id=repository_id,
        repository={
            "workspace_id": workspace_id,
            "repository_id": repository_id,
            "repo_ref": repo_ref,
            "default_branch": "main",
            "credential_ref": existing_credential_ref,
            "access_policy": {"visibility": "private"},
        },
        credentials={
            "repo-existing-checkout": {
                "workspace_id": workspace_id,
                "provider": "github",
                "scope": "repo-existing-checkout",
                "encrypted_value": encrypt_credential("ghp_existing-private"),
                "metadata": {"repository_id": repository_id},
            }
        },
    )
    session = SimpleNamespace(user_id="manager-a", roles=("user",), workspace_id=workspace_id)

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="existing-checkout",
                repo_ref=repo_ref,
                branch="release",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=_ValidRepositoryDiscovery(),
        )

    asyncio.run(run())

    assert db.registered_payload is not None
    assert db.registered_payload.get("credential_ref") == existing_credential_ref
    assert db.repository["credential_ref"] == existing_credential_ref


def test_connect_without_token_reuses_wizard_per_repository_credential(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "wizard-reuse-test-key")
    workspace_id = "workspace-a"
    repo_ref = "acme/wizard-checkout"
    repository_id = derive_repository_id({"workspace_id": workspace_id, "repo_ref": repo_ref})
    scope = f"repository:{repository_id}"
    credential_ref = f"db:github:{scope}"
    db = _ConnectDb(
        workspace_id=workspace_id,
        repo_ref=repo_ref,
        repository_id=repository_id,
        credentials={
            scope: {
                "workspace_id": workspace_id,
                "provider": "github",
                "scope": scope,
                "encrypted_value": encrypt_credential("ghp_wizard-token"),
                "metadata": {
                    "credential_ref": credential_ref,
                    "repository_id": repository_id,
                },
            }
        },
    )
    session = SimpleNamespace(
        user_id="admin-a",
        roles=("service_admin",),
        workspace_id=workspace_id,
    )

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="wizard-checkout",
                repo_ref=repo_ref,
                branch="main",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=_ValidRepositoryDiscovery(),
        )

    asyncio.run(run())

    assert db.registered_payload is not None
    assert db.registered_payload["credential_ref"] == credential_ref


def test_non_admin_cannot_attach_orphan_wizard_credential_to_new_repository() -> None:
    workspace_id = "workspace-a"
    repo_ref = "acme/orphan-private"
    repository_id = derive_repository_id({"workspace_id": workspace_id, "repo_ref": repo_ref})
    scope = f"repository:{repository_id}"
    db = _ConnectDb(
        workspace_id=workspace_id,
        repo_ref=repo_ref,
        repository_id=repository_id,
        credentials={
            scope: {
                "workspace_id": workspace_id,
                "provider": "github",
                "scope": scope,
                "encrypted_value": "fernet:v1:admin-wizard-token",
                "metadata": {"repository_id": repository_id},
            }
        },
    )
    session = SimpleNamespace(user_id="user-a", roles=("user",), workspace_id=workspace_id)

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="orphan-private",
                repo_ref=repo_ref,
                branch="main",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=_ValidRepositoryDiscovery(),
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code in {403, 409}
    assert db.registered_payload is None
    assert db.credentials[scope]["encrypted_value"] == "fernet:v1:admin-wizard-token"


def test_non_admin_explicit_token_cannot_clobber_orphan_wizard_credential(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "orphan-clobber-test-key")
    workspace_id = "workspace-a"
    repo_ref = "acme/orphan-private"
    repository_id = derive_repository_id({"workspace_id": workspace_id, "repo_ref": repo_ref})
    scope = f"repository:{repository_id}"
    original_credential = {
        "workspace_id": workspace_id,
        "provider": "github",
        "scope": scope,
        "encrypted_value": encrypt_credential("ghp_admin-owned"),
        "metadata": {"repository_id": repository_id},
    }
    db = _ConnectDb(
        workspace_id=workspace_id,
        repo_ref=repo_ref,
        repository_id=repository_id,
        credentials={scope: original_credential},
    )
    session = SimpleNamespace(user_id="user-a", roles=("user",), workspace_id=workspace_id)

    async def run() -> object:
        return await connect_application(
            ApplicationConnectRequest(
                name="orphan-private",
                repo_ref=repo_ref,
                token="ghp_attacker-replacement",
                branch="main",
                manifest_path="deploy/app.yaml",
                source_type="raw-yaml",
                cluster_id="cluster-1",
            ),
            current=session,
            db=db,
            discovery=_TokenAwareRepositoryDiscovery(),
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code in {403, 409}
    assert db.registered_payload is None
    assert db.credentials[scope] == original_credential


def test_application_storage_rechecks_manage_after_identity_lock() -> None:
    statements: list[Any] = []

    class ScalarResult:
        def __init__(self, value: str | None = None) -> None:
            self.value = value

        def scalar_one_or_none(self) -> str | None:
            return self.value

    class InterleavedConnection:
        def execute(self, statement: Any) -> ScalarResult:
            statements.append(statement)
            sql = str(statement.compile(dialect=postgresql.dialect()))
            if "pg_advisory_xact_lock" in sql:
                return ScalarResult()
            if "FROM applications" in sql:
                return ScalarResult("app-created-by-other-request")
            pytest.fail(f"unauthorized application write reached storage: {sql}")

    @contextmanager
    def interleaved_connection():
        yield InterleavedConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = interleaved_connection  # type: ignore[method-assign]
    repository.unit_of_work = interleaved_connection  # type: ignore[method-assign]
    repository.can_access = lambda *_args: False  # type: ignore[attr-defined]

    with pytest.raises(LookupError):
        repository.upsert_application(
            {
                "workspace_id": "workspace-a",
                "repository_id": "repo-a",
                "name": "checkout",
                "manifest_path": "deploy/app.yaml",
                "metadata": {"owner": "attacker"},
                "user_id": "attacker-a",
            }
        )

    assert len(statements) == 2


def test_application_late_identity_conflict_is_rejected_instead_of_updated() -> None:
    statements: list[Any] = []

    class ScalarResult:
        def __init__(self, value: str | None = None) -> None:
            self.value = value

        def scalar_one_or_none(self) -> str | None:
            return self.value

    class LateConflictConnection:
        def execute(self, statement: Any) -> ScalarResult:
            statements.append(statement)
            return ScalarResult()

    @contextmanager
    def late_conflict_connection():
        yield LateConflictConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = late_conflict_connection  # type: ignore[method-assign]
    repository.unit_of_work = late_conflict_connection  # type: ignore[method-assign]
    repository.can_access = lambda *_args: False  # type: ignore[attr-defined]
    repository._grant_owner_if_present = (  # type: ignore[method-assign]
        lambda *_args: pytest.fail("late conflict must not grant ownership")
    )

    with pytest.raises(LookupError):
        repository.upsert_application(
            {
                "workspace_id": "workspace-a",
                "repository_id": "repo-a",
                "name": "checkout",
                "manifest_path": "deploy/app.yaml",
                "user_id": "attacker-a",
            }
        )

    assert len(statements) == 3


def test_application_write_locks_repository_before_application_identity() -> None:
    statements: list[Any] = []

    class ScalarResult:
        def __init__(self, value: str | None = None) -> None:
            self.value = value

        def scalar_one_or_none(self) -> str | None:
            return self.value

    class LockOrderConnection:
        def execute(self, statement: Any) -> ScalarResult:
            statements.append(statement)
            sql = str(statement.compile(dialect=postgresql.dialect()))
            if "FROM applications" in sql:
                return ScalarResult()
            if "INSERT INTO applications" in sql:
                return ScalarResult("app-created")
            return ScalarResult()

    @contextmanager
    def lock_order_connection():
        yield LockOrderConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = lock_order_connection  # type: ignore[method-assign]
    repository.unit_of_work = lock_order_connection  # type: ignore[method-assign]
    repository.can_access = lambda *_args: False  # type: ignore[attr-defined]
    repository._grant_owner_if_present = lambda *_args: None  # type: ignore[method-assign]

    repository.upsert_application(
        {
            "workspace_id": "workspace-a",
            "repository_id": "repo-a",
            "repo_ref": "acme/checkout",
            "name": "checkout",
            "manifest_path": "deploy/app.yaml",
            "user_id": "user-a",
        }
    )

    sql = [str(statement.compile(dialect=postgresql.dialect())) for statement in statements]
    assert "pg_advisory_xact_lock" in sql[0]
    assert "pg_advisory_xact_lock" in sql[1]
    assert "FROM applications" in sql[2]


def test_repository_conflict_update_is_workspace_fenced_in_postgresql() -> None:
    statements: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> _MappedResult:
            statements.append(statement)
            if getattr(statement, "is_select", False):
                return _MappedResult(None)
            _sql, params = _compiled(statement)
            return _MappedResult(params)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    repository.unit_of_work = stub_connection  # type: ignore[method-assign]

    repository.register_repository(
        {
            "workspace_id": "workspace-a",
            "repo_ref": "acme/checkout",
            "credential_ref": "db:github:workspace-a",
        }
    )

    sql, _params = _compiled(statements[-1])
    assert "ON CONFLICT (repository_id) DO UPDATE" in sql
    assert "WHERE git_repositories.workspace_id = excluded.workspace_id" in sql
    assert "RETURNING" in sql


def test_repository_lookup_uses_exact_index_before_legacy_casefold_fallback() -> None:
    statements: list[Any] = []
    legacy_row = {
        "workspace_id": "workspace-a",
        "repository_id": "repo-legacy-case",
        "repo_ref": "Acme/Checkout",
    }

    class LookupConnection:
        def execute(self, statement: Any) -> _MappedResult:
            statements.append(statement)
            sql, _params = _compiled(statement)
            if "lower(git_repositories.repo_ref)" in sql:
                return _MappedResult(dict(legacy_row))
            return _MappedResult(None)

    @contextmanager
    def lookup_connection():
        yield LookupConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = lookup_connection  # type: ignore[method-assign]

    found = repository.get_repository_by_ref("workspace-a", "ACME/CHECKOUT.git")

    assert found == legacy_row
    assert len(statements) == 2
    exact_sql, exact_params = _compiled(statements[0])
    fallback_sql, fallback_params = _compiled(statements[1])
    assert "git_repositories.repo_ref =" in exact_sql
    assert "lower(git_repositories.repo_ref)" not in exact_sql
    assert "lower(git_repositories.repo_ref) =" in fallback_sql
    assert "acme/checkout" in exact_params.values()
    assert "acme/checkout" in fallback_params.values()


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
            if getattr(statement, "is_select", False):
                return _MappedResult(None)
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
    repository.unit_of_work = conflict_store_connection  # type: ignore[method-assign]

    error: LookupError | None = None
    try:
        repository.register_repository(attacker_payload)
    except LookupError as exc:
        error = exc

    assert rows[collided_repository_id] == victim_row
    assert error is not None
    assert "workspace" in str(error).lower()
