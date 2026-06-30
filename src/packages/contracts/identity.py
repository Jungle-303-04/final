from __future__ import annotations

from enum import StrEnum


class AccountRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


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


DEFAULT_WORKSPACE_ID = "default"
DEFAULT_WORKSPACE_NAME = "Default Workspace"

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


def access_role_allows_action(role: str, action: str) -> bool:
    return action in ACCESS_ROLE_ACTIONS.get(role, set())
