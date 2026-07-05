from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ServiceRole(StrEnum):
    SERVICE_ADMIN = "service_admin"
    USER = "user"


class AccountRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class OrganizationRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class GroupRole(StrEnum):
    MANAGER = "manager"
    MEMBER = "member"


class ResourceRole(StrEnum):
    OBSERVER = "observer"
    RELEASE_OPERATOR = "release_operator"
    INCIDENT_OPERATOR = "incident_operator"
    CLUSTER_STEWARD = "cluster_steward"


class Permission(StrEnum):
    SERVICE_MANAGE = "service.manage"
    SERVICE_AUDIT_READ = "service.audit.read"
    ORGANIZATION_CREATE = "organization.create"
    ORGANIZATION_DELETE = "organization.delete"
    ORGANIZATION_STATUS_MANAGE = "organization.status.manage"
    ORGANIZATION_OWNER_ASSIGN = "organization.owner.assign"
    ORGANIZATION_MEMBER_MANAGE = "organization.member.manage"
    ORGANIZATION_POLICY_MANAGE = "organization.policy.manage"
    GROUP_CREATE = "group.create"
    GROUP_MEMBER_MANAGE = "group.member.manage"
    RESOURCE_ASSIGN = "resource.assign"
    RESOURCE_ROLE_GRANT = "resource.role.grant"
    PROFILE_READ = "profile.read"
    CLUSTER_READ = "cluster.read"
    DASHBOARD_READ = "dashboard.read"
    EVIDENCE_READ = "evidence.read"
    RCA_READ = "rca.read"
    MANIFEST_READ = "manifest.read"
    DEPLOY_RUN = "deploy.run"
    WORKLOAD_SCALE = "workload.scale"
    IMAGE_UPDATE = "image.update"
    CONFIG_UPDATE = "config.update"
    RESTART_RUN = "restart.run"
    ROLLBACK_RUN = "rollback.run"
    INCIDENT_RESPOND = "incident.respond"
    CLUSTER_POLICY_MANAGE = "cluster.policy.manage"
    CLUSTER_ROLE_MANAGE = "cluster.role.manage"
    DANGEROUS_ACTION_APPROVE = "dangerous_action.approve"


class UserStatus(StrEnum):
    ACTIVE = "active"
    PENDING_EMAIL_VERIFICATION = "pending_email_verification"
    PENDING_APPROVAL = "pending_approval"


class WorkspaceRole(StrEnum):
    OWNER = "owner"
    MEMBER = "member"


class WorkspaceStatus(StrEnum):
    ACTIVE = "active"


class AccessSubjectType(StrEnum):
    USER = "user"
    TEAM = "team"
    WORKSPACE_ROLE = "workspace_role"


class AccessResourceType(StrEnum):
    REPOSITORY = "repository"
    CLUSTER = "cluster"
    DEPLOYMENT_BINDING = "deployment_binding"
    MANIFEST_PATH = "manifest_path"
    SYSTEM_RESOURCE = "system_resource"


class AccessRole(StrEnum):
    OWNER = "owner"
    MAINTAINER = "maintainer"
    DEPLOYER = "deployer"
    VIEWER = "viewer"


class AccessStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class ClusterRegistrationStatus(StrEnum):
    REGISTERED = "registered"


@dataclass(frozen=True)
class PermissionProfile:
    key: str
    label: str
    category: str
    scope: str
    permissions: tuple[str, ...]
    cannot_do: tuple[str, ...]


DEFAULT_WORKSPACE_ID = "default"
DEFAULT_WORKSPACE_NAME = "Default Workspace"
DEFAULT_ORGANIZATION_ID = "default"
DEFAULT_ORGANIZATION_NAME = "Default Organization"
DEFAULT_GROUP_ID = "default-operations"
DEFAULT_GROUP_NAME = "Default Operations"
GLOBAL_ROLE_POLICY_ORGANIZATION_ID = "__global__"

OBSERVABILITY_PERMISSIONS: frozenset[str] = frozenset(
    {
        Permission.CLUSTER_READ.value,
        Permission.DASHBOARD_READ.value,
        Permission.EVIDENCE_READ.value,
        Permission.RCA_READ.value,
        Permission.MANIFEST_READ.value,
    }
)
RELEASE_PERMISSIONS: frozenset[str] = OBSERVABILITY_PERMISSIONS | frozenset(
    {
        Permission.DEPLOY_RUN.value,
        Permission.WORKLOAD_SCALE.value,
        Permission.IMAGE_UPDATE.value,
        Permission.CONFIG_UPDATE.value,
    }
)
INCIDENT_PERMISSIONS: frozenset[str] = RELEASE_PERMISSIONS | frozenset(
    {
        Permission.RESTART_RUN.value,
        Permission.ROLLBACK_RUN.value,
        Permission.INCIDENT_RESPOND.value,
    }
)
CLUSTER_STEWARD_PERMISSIONS: frozenset[str] = INCIDENT_PERMISSIONS | frozenset(
    {
        Permission.CLUSTER_POLICY_MANAGE.value,
        Permission.CLUSTER_ROLE_MANAGE.value,
        Permission.DANGEROUS_ACTION_APPROVE.value,
    }
)

RESOURCE_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    ResourceRole.OBSERVER.value: OBSERVABILITY_PERMISSIONS,
    ResourceRole.RELEASE_OPERATOR.value: RELEASE_PERMISSIONS,
    ResourceRole.INCIDENT_OPERATOR.value: INCIDENT_PERMISSIONS,
    ResourceRole.CLUSTER_STEWARD.value: CLUSTER_STEWARD_PERMISSIONS,
}
ORGANIZATION_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    OrganizationRole.OWNER.value: frozenset(
        {
            Permission.ORGANIZATION_DELETE.value,
            Permission.ORGANIZATION_STATUS_MANAGE.value,
            Permission.ORGANIZATION_OWNER_ASSIGN.value,
            Permission.ORGANIZATION_MEMBER_MANAGE.value,
            Permission.ORGANIZATION_POLICY_MANAGE.value,
            Permission.GROUP_CREATE.value,
            Permission.RESOURCE_ASSIGN.value,
        }
    ),
    OrganizationRole.ADMIN.value: frozenset(
        {
            Permission.ORGANIZATION_MEMBER_MANAGE.value,
            Permission.GROUP_CREATE.value,
            Permission.RESOURCE_ASSIGN.value,
        }
    ),
    OrganizationRole.MEMBER.value: frozenset({Permission.PROFILE_READ.value}),
}
GROUP_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    GroupRole.MANAGER.value: frozenset(
        {
            Permission.GROUP_MEMBER_MANAGE.value,
            Permission.RESOURCE_ROLE_GRANT.value,
        }
    ),
    GroupRole.MEMBER.value: frozenset({Permission.PROFILE_READ.value}),
}
SERVICE_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    ServiceRole.SERVICE_ADMIN.value: frozenset(permission.value for permission in Permission),
    ServiceRole.USER.value: frozenset({Permission.PROFILE_READ.value}),
}

ROLE_PROFILES: tuple[PermissionProfile, ...] = (
    PermissionProfile(
        key=ServiceRole.SERVICE_ADMIN.value,
        label="서비스 최고 관리자",
        category="service",
        scope="service",
        permissions=tuple(sorted(SERVICE_ROLE_PERMISSIONS[ServiceRole.SERVICE_ADMIN.value])),
        cannot_do=("감사 로그 없이 운영 작업 수행",),
    ),
    PermissionProfile(
        key=OrganizationRole.OWNER.value,
        label="조직 소유자",
        category="organization",
        scope="organization",
        permissions=tuple(sorted(ORGANIZATION_ROLE_PERMISSIONS[OrganizationRole.OWNER.value])),
        cannot_do=("다른 조직 접근", "리소스 역할 없이 클러스터 작업"),
    ),
    PermissionProfile(
        key=OrganizationRole.ADMIN.value,
        label="조직 관리자",
        category="organization",
        scope="organization",
        permissions=tuple(sorted(ORGANIZATION_ROLE_PERMISSIONS[OrganizationRole.ADMIN.value])),
        cannot_do=("조직 삭제", "조직 소유자 지정", "리소스 역할 없이 클러스터 작업"),
    ),
    PermissionProfile(
        key=GroupRole.MANAGER.value,
        label="그룹 관리자",
        category="group",
        scope="group",
        permissions=tuple(sorted(GROUP_ROLE_PERMISSIONS[GroupRole.MANAGER.value])),
        cannot_do=("자기 권한 승격", "조직 전체 관리", "클러스터 작업 자동 획득"),
    ),
    PermissionProfile(
        key=OrganizationRole.MEMBER.value,
        label="조직 구성원",
        category="base",
        scope="organization",
        permissions=tuple(sorted(ORGANIZATION_ROLE_PERMISSIONS[OrganizationRole.MEMBER.value])),
        cannot_do=("기본 클러스터 접근", "멤버/그룹/권한 관리"),
    ),
    PermissionProfile(
        key=ResourceRole.OBSERVER.value,
        label="관측 담당",
        category="resource",
        scope="cluster",
        permissions=tuple(sorted(RESOURCE_ROLE_PERMISSIONS[ResourceRole.OBSERVER.value])),
        cannot_do=("배포", "수정", "삭제", "위험 작업"),
    ),
    PermissionProfile(
        key=ResourceRole.RELEASE_OPERATOR.value,
        label="배포 담당",
        category="resource",
        scope="cluster",
        permissions=tuple(sorted(RESOURCE_ROLE_PERMISSIONS[ResourceRole.RELEASE_OPERATOR.value])),
        cannot_do=("삭제", "위험 명령", "권한 관리"),
    ),
    PermissionProfile(
        key=ResourceRole.INCIDENT_OPERATOR.value,
        label="운영 담당",
        category="resource",
        scope="cluster",
        permissions=tuple(sorted(RESOURCE_ROLE_PERMISSIONS[ResourceRole.INCIDENT_OPERATOR.value])),
        cannot_do=("클러스터 권한 부여/회수", "조직/그룹 관리"),
    ),
    PermissionProfile(
        key=ResourceRole.CLUSTER_STEWARD.value,
        label="클러스터 책임자",
        category="resource",
        scope="cluster",
        permissions=tuple(sorted(RESOURCE_ROLE_PERMISSIONS[ResourceRole.CLUSTER_STEWARD.value])),
        cannot_do=("조직 멤버 관리", "그룹 자체 관리"),
    ),
)

DEFAULT_ROLE_PERMISSION_ROWS: tuple[tuple[str, str, str, str, str], ...] = tuple(
    (
        GLOBAL_ROLE_POLICY_ORGANIZATION_ID,
        resource_type,
        role,
        permission,
        AccessStatus.ACTIVE.value,
    )
    for resource_type in (
        AccessResourceType.CLUSTER.value,
        AccessResourceType.MANIFEST_PATH.value,
    )
    for role, permissions in RESOURCE_ROLE_PERMISSIONS.items()
    for permission in sorted(permissions)
)

LEGACY_RESOURCE_ROLE_MAP: dict[str, str] = {
    "owner": ResourceRole.CLUSTER_STEWARD.value,
    "maintainer": ResourceRole.INCIDENT_OPERATOR.value,
    "deployer": ResourceRole.RELEASE_OPERATOR.value,
    "viewer": ResourceRole.OBSERVER.value,
    "admin": ResourceRole.CLUSTER_STEWARD.value,
    "developer": ResourceRole.RELEASE_OPERATOR.value,
}
LEGACY_PERMISSION_ALIASES: dict[str, str] = {
    "read": Permission.CLUSTER_READ.value,
    "write": Permission.CONFIG_UPDATE.value,
    "deploy": Permission.DEPLOY_RUN.value,
    "admin": Permission.CLUSTER_ROLE_MANAGE.value,
}

READ_ACCESS = "read"
WRITE_ACCESS = "write"
DEPLOY_ACCESS = "deploy"
ADMIN_ACCESS = "admin"

ACCESS_ROLE_ACTIONS: dict[str, set[str]] = {
    AccessRole.OWNER.value: {READ_ACCESS, WRITE_ACCESS, DEPLOY_ACCESS, ADMIN_ACCESS},
    AccessRole.MAINTAINER.value: {READ_ACCESS, WRITE_ACCESS, DEPLOY_ACCESS},
    AccessRole.DEPLOYER.value: {READ_ACCESS, DEPLOY_ACCESS},
    AccessRole.VIEWER.value: {READ_ACCESS},
}

ACTION_PERMISSION_ALIASES: dict[str, str] = {
    READ_ACCESS: Permission.CLUSTER_READ.value,
    WRITE_ACCESS: Permission.CONFIG_UPDATE.value,
    DEPLOY_ACCESS: Permission.DEPLOY_RUN.value,
    ADMIN_ACCESS: Permission.CLUSTER_ROLE_MANAGE.value,
}


def access_role_allows_action(role: str, action: str) -> bool:
    return action in ACCESS_ROLE_ACTIONS.get(role, set())


def resource_role_allows_permission(role: str, permission: str) -> bool:
    normalized_role = normalize_resource_role(role)
    normalized_permission = LEGACY_PERMISSION_ALIASES.get(permission, permission)
    return normalized_permission in RESOURCE_ROLE_PERMISSIONS.get(normalized_role, frozenset())


def normalize_resource_role(role: str) -> str:
    return LEGACY_RESOURCE_ROLE_MAP.get(role, role)
