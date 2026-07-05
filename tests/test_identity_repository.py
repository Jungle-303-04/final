from __future__ import annotations

from contextlib import contextmanager
from typing import Any

from sqlalchemy.dialects import postgresql

from domains.identity.repository import WorkspaceAccessRepository
from packages.contracts.identity import (
    DEPLOY_ACCESS,
    AccessResourceType,
    AccessRole,
    AccountRole,
    UserStatus,
    WorkspaceRole,
)


def test_member_upsert_preserves_existing_owner_role() -> None:
    statement = WorkspaceAccessRepository._member_upsert(
        "default",
        "user-1",
        WorkspaceRole.MEMBER.value,
    )
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = str(compiled)

    assert "CASE WHEN" in sql
    assert "excluded.role" in sql
    assert "workspace_members.role" in sql
    assert WorkspaceRole.OWNER.value in compiled.params.values()


def test_admin_user_upsert_uses_email_conflict_and_active_admin_role() -> None:
    statement = WorkspaceAccessRepository._admin_user_upsert(
        "user-admin",
        "admin@example.com",
        "hashed-password",
        "admin",
    )
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    params = compiled.params

    assert "ON CONFLICT (email)" in sql
    assert AccountRole.ADMIN.value in params.values()
    assert UserStatus.ACTIVE.value in params.values()
    assert "hashed-password" in params.values()


class CapturingConnection:
    def __init__(self, resource_ids: list[str]) -> None:
        self.resource_ids = resource_ids
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> CapturingConnection:
        self.statements.append(statement)
        return self

    def scalars(self) -> CapturingConnection:
        return self

    def all(self) -> list[str]:
        return self.resource_ids


def repository_for_access_filter(
    *,
    admin: bool = False,
    owner: bool = False,
    resource_ids: list[str] | None = None,
) -> tuple[WorkspaceAccessRepository, CapturingConnection]:
    repository = object.__new__(WorkspaceAccessRepository)
    connection = CapturingConnection(resource_ids or [])
    repository._is_account_admin = lambda _user_id: admin  # type: ignore[method-assign]
    repository._is_workspace_owner = lambda _user_id, _workspace_id: owner  # type: ignore[method-assign]

    @contextmanager
    def connection_context():
        yield connection

    repository.connection = connection_context  # type: ignore[method-assign]
    return repository, connection


def test_accessible_resource_ids_returns_none_for_workspace_owner() -> None:
    repository, connection = repository_for_access_filter(owner=True)

    allowed = repository.accessible_resource_ids(
        "user-1",
        "workspace-1",
        AccessResourceType.CLUSTER.value,
        DEPLOY_ACCESS,
    )

    assert allowed is None
    assert connection.statements == []


def test_accessible_resource_ids_filters_active_user_grants_by_role() -> None:
    repository, connection = repository_for_access_filter(resource_ids=["cluster-1", "cluster-2"])

    allowed = repository.accessible_resource_ids(
        "user-1",
        "workspace-1",
        AccessResourceType.CLUSTER.value,
        DEPLOY_ACCESS,
    )

    assert allowed == {"cluster-1", "cluster-2"}
    assert len(connection.statements) == 1
    compiled = connection.statements[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    params = str(compiled.params)
    assert "resource_access_grants.resource_type = " in sql
    assert "resource_access_grants.role IN" in sql
    assert AccessRole.OWNER.value in params
    assert AccessRole.MAINTAINER.value in params
    assert AccessRole.DEPLOYER.value in params
    assert AccessRole.VIEWER.value not in params
