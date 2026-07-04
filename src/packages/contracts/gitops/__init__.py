from __future__ import annotations

from dataclasses import dataclass
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


@dataclass(frozen=True)
class KubernetesResourceContract:
    api_version: str
    kind: str
    api_prefix: str
    plural: str
    namespaced: bool = True


SUPPORTED_KUBERNETES_RESOURCES: dict[tuple[str, str], KubernetesResourceContract] = {
    ("apps/v1", "Deployment"): KubernetesResourceContract(
        api_version="apps/v1",
        kind="Deployment",
        api_prefix="/apis/apps/v1",
        plural="deployments",
    ),
    ("v1", "Service"): KubernetesResourceContract(
        api_version="v1",
        kind="Service",
        api_prefix="/api/v1",
        plural="services",
    ),
    ("v1", "ConfigMap"): KubernetesResourceContract(
        api_version="v1",
        kind="ConfigMap",
        api_prefix="/api/v1",
        plural="configmaps",
    ),
}


def supported_kubernetes_resource(api_version: str, kind: str) -> KubernetesResourceContract:
    try:
        return SUPPORTED_KUBERNETES_RESOURCES[(api_version, kind)]
    except KeyError:
        raise ValueError(f"unsupported manifest kind: {api_version}/{kind}") from None


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
