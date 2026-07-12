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
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from domains.applications.router import upsert_application
from domains.gitops.repository import RepoChangeRepository, derive_repository_id
from packages.contracts.gateway.requests import ApplicationUpsertRequest


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
