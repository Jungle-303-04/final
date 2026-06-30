from __future__ import annotations

from enum import StrEnum


class GitProvider(StrEnum):
    GITHUB = "github"


class RepositoryStatus(StrEnum):
    ACTIVE = "active"
    INVALID_CREDENTIAL = "invalid_credential"
    DISABLED = "disabled"


class WatchTargetStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"


class DeploymentBindingStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    INVALID_CONFIG = "invalid_config"


class ManifestArtifactStatus(StrEnum):
    RENDERED = "rendered"
    INVALID_CONFIG = "invalid_config"


class ApplicationStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class WorkflowRunStatus(StrEnum):
    STARTED = "started"
    RENDERING = "rendering"
    DIFFING = "diffing"
    POLICY_CHECKING = "policy_checking"
    WAITING_FOR_APPROVAL = "waiting_for_approval"
    APPLYING = "applying"
    ROLLOUT_WAITING = "rollout_waiting"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class WorkflowStepName(StrEnum):
    GIT = "git"
    RENDER = "render"
    DIFF = "diff"
    POLICY = "policy"
    APPROVAL = "approval"
    SAFE_PR = "safe_pr"
    APPLY = "apply"
    HEALTH = "health"


class WorkflowStepStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"


class ApprovalStatus(StrEnum):
    REQUESTED = "requested"
    GRANTED = "granted"
    REJECTED = "rejected"
    EXPIRED = "expired"
    NOT_REQUIRED = "not_required"


class ResourceClass(StrEnum):
    APPLICATION = "application"
    PLATFORM = "platform"
    SYSTEM = "system"


DEFAULT_REPOSITORY_ID = "repo-default"
DEFAULT_WATCH_TARGET_ID = "watch-default"
DEFAULT_DEPLOYMENT_BINDING_ID = "binding-default"
DEFAULT_APPLICATION_ID = "app-checkout-api"
DEFAULT_WORKFLOW_RUN_ID = "workflow-default"
DEFAULT_ENVIRONMENT = "sandbox"
DEFAULT_REPO_REF = "octocat/Hello-World"
DEFAULT_REPO_BRANCH = "main"
DEFAULT_MANIFEST_PATH = "deploy.yaml"
GITHUB_TOKEN_ENV = "GITHUB_TOKEN"
GITHUB_API_BASE_ENV = "GITHUB_API_BASE"
DEFAULT_GITHUB_API_BASE = "https://api.github.com"
