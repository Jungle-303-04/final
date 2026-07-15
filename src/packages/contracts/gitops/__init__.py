from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from packages.config.constants import CommandStatus


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


@dataclass(frozen=True)
class WorkflowMutation:
    """The outcome of one guarded workflow persistence attempt.

    ``applied`` is true only when PostgreSQL inserted a row or accepted a state
    transition. ``values`` contains the small, safe identity projection needed
    by orchestration code; it deliberately excludes summaries, manifests,
    command results, and JSON metadata.
    """

    applied: bool
    values: Mapping[str, str] = field(default_factory=dict)


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


def promotion_gate_from_command_result(result: Mapping[str, Any]) -> dict[str, Any]:
    """Expose the exact command-result checks used by automatic promotion."""
    resources = result.get("resources")
    resource_list = resources if isinstance(resources, list) else []
    failed_resources = [
        dict(item)
        for item in resource_list
        if isinstance(item, Mapping)
        and (item.get("applied") is False or str(item.get("status", "")).lower() == "failed")
    ]
    command_status = result.get("status")
    command_completed = command_status == CommandStatus.COMPLETED
    applied_value = result.get("applied")
    applied = applied_value if isinstance(applied_value, bool) else None
    applied_not_false = applied_value is not False
    rollout = result.get("rollout")
    rollout_ready_value = rollout.get("ready") if isinstance(rollout, Mapping) else None
    rollout_ready = rollout_ready_value if isinstance(rollout_ready_value, bool) else None
    rollout_ready_not_false = rollout_ready_value is not False
    return {
        "eligible": (
            command_completed
            and applied_not_false
            and not failed_resources
            and rollout_ready_not_false
        ),
        "command_status": str(command_status or ""),
        "command_completed": command_completed,
        "applied": applied,
        "applied_not_false": applied_not_false,
        "failed_resources": failed_resources,
        "failed_resource_count": len(failed_resources),
        "rollout_ready": rollout_ready,
        "rollout_ready_not_false": rollout_ready_not_false,
    }


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


DEFAULT_REPOSITORY_ID = ""
DEFAULT_WATCH_TARGET_ID = ""
DEFAULT_DEPLOYMENT_BINDING_ID = ""
DEFAULT_APPLICATION_ID = ""
DEFAULT_WORKFLOW_RUN_ID = ""
DEFAULT_ENVIRONMENT = "sandbox"
DEFAULT_REPO_REF = ""
DEFAULT_REPO_BRANCH = "main"
DEFAULT_MANIFEST_PATH = "deploy.yaml"
PUBLIC_GITHUB_CREDENTIAL_REF = "public:anonymous"
GITHUB_TOKEN_ENV = "GITHUB_TOKEN"
GITHUB_TOKEN_REF_ENV = "GITHUB_TOKEN_REF"
GITHUB_API_BASE_ENV = "GITHUB_API_BASE"
DEFAULT_GITHUB_API_BASE = "https://api.github.com"
# owner/name 축약 repo_ref 로 clone URL 을 만들 때의 웹 호스트.
# GitHub Enterprise 등 자체 호스트는 이 env 로 교체(API 호스트와 별개)
GITHUB_WEB_BASE_ENV = "GITHUB_WEB_BASE"
DEFAULT_GITHUB_WEB_BASE = "https://github.com"
