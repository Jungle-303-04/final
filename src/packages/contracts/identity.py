from __future__ import annotations

from enum import StrEnum


class AccountRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class UserStatus(StrEnum):
    ACTIVE = "active"
    PENDING_EMAIL_VERIFICATION = "pending_email_verification"


class WorkspaceRole(StrEnum):
    OWNER = "owner"


class WorkspaceStatus(StrEnum):
    ACTIVE = "active"


class ClusterRegistrationStatus(StrEnum):
    REGISTERED = "registered"
