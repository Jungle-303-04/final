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


class ClusterRegistrationStatus(StrEnum):
    REGISTERED = "registered"


DEFAULT_WORKSPACE_ID = "default"
DEFAULT_WORKSPACE_NAME = "Default Workspace"
