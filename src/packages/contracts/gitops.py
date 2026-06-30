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


class ResourceClass(StrEnum):
    APPLICATION = "application"
    PLATFORM = "platform"
    SYSTEM = "system"


DEFAULT_REPOSITORY_ID = "repo-default"
DEFAULT_WATCH_TARGET_ID = "watch-default"
DEFAULT_DEPLOYMENT_BINDING_ID = "binding-default"
DEFAULT_REPO_REF = "octocat/Hello-World"
DEFAULT_REPO_BRANCH = "main"
DEFAULT_MANIFEST_PATH = "deploy.yaml"
