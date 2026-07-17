from __future__ import annotations

from contextlib import contextmanager
from inspect import Parameter, signature
from typing import Any

from sqlalchemy.dialects import postgresql

from domains.identity.repository import WorkspaceAccessRepository
from packages.contracts.identity import (
    DEFAULT_ROLE_PERMISSION_ROWS,
    PLATFORM_RESOURCE_TYPES,
    AccessResourceType,
    AccessStatus,
    OrganizationRole,
    Permission,
    ResourceRole,
    ServiceRole,
    UserStatus,
)


def test_organization_member_upsert_preserves_existing_owner_role() -> None:
    statement = WorkspaceAccessRepository._organization_member_upsert(
        "org-1",
        "user-1",
        OrganizationRole.MEMBER.value,
    )
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = str(compiled)

    assert "CASE WHEN" in sql
    assert "excluded.role" in sql
    assert "organization_members.role" in sql
    assert OrganizationRole.OWNER.value in compiled.params.values()


def test_admin_user_upsert_uses_service_admin_role() -> None:
    statement = WorkspaceAccessRepository._admin_user_upsert(
        "user-admin",
        "admin@example.com",
        "hashed-password",
        "admin",
    )
    compiled = statement.compile(dialect=postgresql.dialect())

    assert "ON CONFLICT (email)" in str(compiled)
    assert ServiceRole.SERVICE_ADMIN.value in compiled.params.values()
    assert UserStatus.ACTIVE.value in compiled.params.values()
    assert "hashed-password" in compiled.params.values()


def test_role_permission_upsert_is_organization_scoped() -> None:
    statement = WorkspaceAccessRepository._role_permission_upsert(
        "org-a",
        AccessResourceType.CLUSTER.value,
        ResourceRole.RELEASE_OPERATOR.value,
        Permission.DEPLOY_RUN.value,
        AccessStatus.ACTIVE.value,
    )
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = str(compiled)

    assert "organization_id" in sql
    assert "resource_type" in sql
    assert "permission" in sql
    assert "ON CONFLICT" in sql
    assert "org-a" in compiled.params.values()


def test_default_role_permissions_cover_platform_resource_types() -> None:
    resource_types = {row[1] for row in DEFAULT_ROLE_PERMISSION_ROWS}

    assert resource_types == set(PLATFORM_RESOURCE_TYPES)
    assert AccessResourceType.CLUSTER.value in resource_types
    assert AccessResourceType.WORKLOAD.value in resource_types
    assert AccessResourceType.APPLICATION.value in resource_types
    assert AccessResourceType.CATALOG_ITEM.value in resource_types
    assert AccessResourceType.STACK.value in resource_types


def test_release_operator_policy_supports_application_and_catalog_actions() -> None:
    rows = {
        (resource_type, role, permission)
        for _organization_id, resource_type, role, permission, status in DEFAULT_ROLE_PERMISSION_ROWS
        if status == AccessStatus.ACTIVE.value
    }
    assert (
        AccessResourceType.APPLICATION.value,
        ResourceRole.RELEASE_OPERATOR.value,
        Permission.APPLICATION_MANAGE.value,
    ) in rows
    assert (
        AccessResourceType.CATALOG_ITEM.value,
        ResourceRole.RELEASE_OPERATOR.value,
        Permission.CATALOG_INSTALL.value,
    ) in rows
    assert (
        AccessResourceType.STACK.value,
        ResourceRole.RELEASE_OPERATOR.value,
        Permission.STACK_PLAN.value,
    ) in rows


def repository_for_can_access(*, service_admin: bool = False, member_role: str | None = None):
    repository = object.__new__(WorkspaceAccessRepository)
    repository.is_service_admin = lambda _user_id: service_admin  # type: ignore[method-assign]
    repository.get_organization_member = (  # type: ignore[method-assign]
        lambda _org_id, _user_id: {"role": OrganizationRole.MEMBER.value}
    )
    repository.get_resource_assignment_for_org = (  # type: ignore[method-assign]
        lambda _org_id, _resource_type, _resource_id: {
            "group_id": "group-1",
            "resource_assignment_id": "ra-1",
        }
    )
    repository.get_group_member = (  # type: ignore[method-assign]
        lambda _group_id, _user_id: {"role": "member"}
    )
    repository.get_member_resource_role = (  # type: ignore[method-assign]
        lambda _assignment_id, _user_id: {"role": member_role} if member_role is not None else None
    )
    repository.role_has_permission = (  # type: ignore[method-assign]
        lambda _resource_type, role, permission, _organization_id=None: (
            role == ResourceRole.RELEASE_OPERATOR.value
            and permission == Permission.DEPLOY_RUN.value
        )
    )
    return repository


def test_can_access_denies_plain_org_member_without_resource_role() -> None:
    repository = repository_for_can_access(member_role=None)

    assert not repository.can_access(
        "user-1",
        "org-a",
        AccessResourceType.CLUSTER.value,
        "cluster-1",
        Permission.DEPLOY_RUN.value,
    )


def test_can_access_allows_assigned_resource_role_permission() -> None:
    repository = repository_for_can_access(member_role=ResourceRole.RELEASE_OPERATOR.value)

    assert repository.can_access(
        "user-1",
        "org-a",
        AccessResourceType.CLUSTER.value,
        "cluster-1",
        Permission.DEPLOY_RUN.value,
    )


def test_service_admin_can_access_every_resource_action() -> None:
    repository = repository_for_can_access(service_admin=True)

    assert repository.can_access(
        "admin-1",
        "org-a",
        AccessResourceType.CLUSTER.value,
        "cluster-1",
        Permission.DANGEROUS_ACTION_APPROVE.value,
    )


def test_accessible_resource_ids_reuses_organization_scoped_role_policy() -> None:
    class StubResult:
        def mappings(self) -> list[dict[str, str]]:
            return [
                {"resource_id": "cluster-1", "role": ResourceRole.OBSERVER.value},
                {"resource_id": "cluster-2", "role": ResourceRole.RELEASE_OPERATOR.value},
            ]

    class StubConnection:
        def execute(self, _statement: Any) -> StubResult:
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(WorkspaceAccessRepository)
    repository.is_service_admin = lambda _user_id: False  # type: ignore[method-assign]
    repository.connection = stub_connection  # type: ignore[method-assign]
    calls: list[tuple[str, str, str, str]] = []

    def role_has_permission(
        resource_type: str,
        role: str,
        permission: str,
        organization_id: str | None = None,
    ) -> bool:
        calls.append((resource_type, role, permission, str(organization_id)))
        return role == ResourceRole.RELEASE_OPERATOR.value

    repository.role_has_permission = role_has_permission  # type: ignore[method-assign]

    assert repository.accessible_resource_ids(
        "user-1",
        "org-a",
        AccessResourceType.CLUSTER.value,
        Permission.DEPLOY_RUN.value,
    ) == {"cluster-2"}
    assert set(calls) == {
        (
            AccessResourceType.CLUSTER.value,
            ResourceRole.OBSERVER.value,
            Permission.DEPLOY_RUN.value,
            "org-a",
        ),
        (
            AccessResourceType.CLUSTER.value,
            ResourceRole.RELEASE_OPERATOR.value,
            Permission.DEPLOY_RUN.value,
            "org-a",
        ),
    }


def test_list_access_grants_requires_organization_id_without_global_default() -> None:
    parameters = signature(WorkspaceAccessRepository.list_access_grants).parameters

    assert list(parameters)[:3] == ["self", "organization_id", "resource_id"]
    assert parameters["organization_id"].default is Parameter.empty
    assert parameters["resource_id"].default is None


def test_list_access_grants_sql_always_filters_organization_id() -> None:
    captured: list[Any] = []

    class StubMappings:
        def all(self) -> list[dict[str, Any]]:
            return []

    class StubResult:
        def mappings(self) -> StubMappings:
            return StubMappings()

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            captured.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(WorkspaceAccessRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.list_access_grants("workspace-a") == []
    assert len(captured) == 1
    compiled = captured[0].compile(dialect=postgresql.dialect())

    assert "resource_assignments.organization_id =" in str(compiled)
    assert "workspace-a" in compiled.params.values()


def test_active_user_groups_are_workspace_scoped_and_sorted() -> None:
    captured: list[Any] = []

    class StubMappings:
        def all(self) -> list[dict[str, str]]:
            return [{"group_id": "group-platform"}, {"group_id": "group-release"}]

    class StubResult:
        def mappings(self) -> StubMappings:
            return StubMappings()

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            captured.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(WorkspaceAccessRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.list_active_group_ids_for_user("user-1", "workspace-a") == [
        "group-platform",
        "group-release",
    ]
    compiled = captured[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "groups.organization_id =" in sql
    assert "group_members.user_id =" in sql
    assert sql.count("status =") == 2
    assert {"user-1", "workspace-a", AccessStatus.ACTIVE.value}.issubset(
        set(compiled.params.values())
    )
