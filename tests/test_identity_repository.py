from __future__ import annotations

from sqlalchemy.dialects import postgresql

from domains.identity.repository import WorkspaceAccessRepository
from packages.contracts.identity import (
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
