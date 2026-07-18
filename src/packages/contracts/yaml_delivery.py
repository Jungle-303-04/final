"""Contracts for manifest-edit Git delivery and observed GitOps completion."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Protocol

from packages.contracts.gitops import WorkflowMutation
from packages.contracts.parity import OperationEvent, OperationEventKind

GIT_SHA_PATTERN = re.compile(r"[0-9a-f]{7,64}")
SHA256_PATTERN = re.compile(r"sha256:[0-9a-f]{64}")


class YamlDeliveryStage(StrEnum):
    VALIDATION = "validation"
    COMMIT = "commit"
    PR = "pr"
    MERGE = "merge"
    SYNC = "sync"
    ROLLOUT = "rollout"
    DONE = "done"


class YamlDeliveryOutcomeStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    REVIEW_REQUIRED = "review_required"
    COMPLETED = "completed"
    FAILED = "failed"


class YamlDeliveryFailureCode(StrEnum):
    VALIDATION_FAILED = "validation_failed"
    CI_FAILED = "ci_failed"
    CONFLICT = "conflict"
    CONTROLLER_OFFLINE = "controller_offline"
    SYNC_FAILED = "sync_failed"
    ROLLOUT_UNHEALTHY = "rollout_unhealthy"
    TIMEOUT = "timeout"
    PROVIDER_ERROR = "provider_error"
    EVIDENCE_INVALID = "evidence_invalid"
    LEDGER_CONFLICT = "ledger_conflict"


class WorkspaceDeliveryTier(StrEnum):
    DEVELOPMENT = "development"
    DEMO = "demo"
    PROTECTED = "protected"
    PRODUCTION = "production"


class PullRequestChecksStatus(StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class GitOpsSyncStatus(StrEnum):
    PENDING = "pending"
    SYNCED = "synced"
    FAILED = "failed"


class GitOpsHealthStatus(StrEnum):
    UNKNOWN = "unknown"
    PROGRESSING = "progressing"
    HEALTHY = "healthy"
    DEGRADED = "degraded"


@dataclass(frozen=True)
class YamlDeliveryRequest:
    operation_id: str
    workflow_run_id: str
    workspace_id: str
    application_id: str
    binding_id: str
    environment: str
    cluster_id: str
    repository_id: str
    repo_ref: str
    base_branch: str
    manifest_path: str
    change_ref: str
    source_revision: str
    desired_sha256: str

    def __post_init__(self) -> None:
        identities = (
            self.operation_id,
            self.workflow_run_id,
            self.workspace_id,
            self.application_id,
            self.binding_id,
            self.environment,
            self.cluster_id,
            self.repository_id,
            self.repo_ref,
            self.base_branch,
            self.manifest_path,
            self.change_ref,
        )
        if any(not value or value != value.strip() for value in identities):
            raise ValueError("yaml delivery identities must be non-empty and canonical")
        _require_git_sha(self.source_revision, "source_revision")
        if SHA256_PATTERN.fullmatch(self.desired_sha256) is None:
            raise ValueError("desired_sha256 must be a canonical sha256 digest")


@dataclass(frozen=True)
class WorkspaceDeliveryPolicy:
    tier: WorkspaceDeliveryTier
    auto_merge: bool
    authority: str

    def __post_init__(self) -> None:
        if not self.authority.strip():
            raise ValueError("workspace delivery policy requires authority evidence")
        if self.auto_merge and self.tier not in {
            WorkspaceDeliveryTier.DEVELOPMENT,
            WorkspaceDeliveryTier.DEMO,
        }:
            raise ValueError("auto-merge is limited to development and demo policies")


@dataclass(frozen=True)
class ValidationEvidence:
    validation_id: str
    source_revision: str
    desired_sha256: str


@dataclass(frozen=True)
class CommitEvidence:
    commit_sha: str
    branch: str


@dataclass(frozen=True)
class PullRequestEvidence:
    number: int
    url: str
    head_sha: str
    base_sha: str


@dataclass(frozen=True)
class PullRequestState:
    head_sha: str
    checks: PullRequestChecksStatus
    mergeable: bool | None
    merged: bool = False
    merge_sha: str | None = None
    merged_at: str | None = None
    reason: str | None = None


@dataclass(frozen=True)
class MergeEvidence:
    merge_sha: str
    head_sha: str
    merged_at: str


@dataclass(frozen=True)
class GitOpsSyncReceipt:
    sync_id: str
    revision: str


@dataclass(frozen=True)
class GitOpsObservation:
    controller_online: bool
    observed_revision: str
    sync_revision: str
    sync_status: GitOpsSyncStatus
    health_status: GitOpsHealthStatus
    resource_version: str | None = None
    message: str | None = None


@dataclass(frozen=True)
class YamlDeliveryResult:
    operation_id: str
    workflow_run_id: str
    status: YamlDeliveryOutcomeStatus
    stage: YamlDeliveryStage
    evidence: Mapping[str, object] = field(default_factory=dict)
    failure_code: YamlDeliveryFailureCode | None = None
    message: str | None = None


class YamlDeliveryPortError(RuntimeError):
    def __init__(self, code: YamlDeliveryFailureCode, message: str) -> None:
        super().__init__(message)
        self.code = code


class YamlDeliveryScmPort(Protocol):
    """Idempotent SCM boundary keyed by ``request.operation_id``."""

    async def validate_change(self, request: YamlDeliveryRequest) -> ValidationEvidence: ...

    async def commit_change(
        self,
        request: YamlDeliveryRequest,
        validation: ValidationEvidence,
    ) -> CommitEvidence: ...

    async def create_pull_request(
        self,
        request: YamlDeliveryRequest,
        commit: CommitEvidence,
    ) -> PullRequestEvidence: ...

    async def get_pull_request(
        self,
        request: YamlDeliveryRequest,
        pull_request: PullRequestEvidence,
    ) -> PullRequestState: ...

    async def merge_pull_request(
        self,
        request: YamlDeliveryRequest,
        pull_request: PullRequestEvidence,
        *,
        expected_head_sha: str,
    ) -> MergeEvidence: ...


class YamlDeliveryGitOpsPort(Protocol):
    """Outbound GitOps controller boundary; implementations may use only agent paths."""

    async def request_sync(
        self,
        request: YamlDeliveryRequest,
        *,
        revision: str,
    ) -> GitOpsSyncReceipt: ...

    async def observe(
        self,
        request: YamlDeliveryRequest,
        *,
        revision: str,
    ) -> GitOpsObservation: ...


class WorkspaceDeliveryPolicyPort(Protocol):
    async def resolve(self, request: YamlDeliveryRequest) -> WorkspaceDeliveryPolicy: ...


class YamlDeliveryLedger(Protocol):
    async def get_cluster_registration(
        self, workspace_id: str, cluster_id: str
    ) -> Mapping[str, object] | None: ...

    async def get_workflow_run(self, workflow_run_id: str) -> Mapping[str, object] | None: ...

    async def get_workflow_step_details(
        self, workflow_run_id: str, name: str
    ) -> Mapping[str, object] | None: ...

    async def start_workflow_run(self, payload: dict[str, object]) -> WorkflowMutation: ...

    async def update_workflow_run(self, payload: dict[str, object]) -> WorkflowMutation: ...

    async def record_workflow_step(self, payload: dict[str, object]) -> WorkflowMutation: ...

    async def append_command_operation_event(
        self,
        workspace_id: str,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
    ) -> OperationEvent | None: ...

    async def list_command_operation_events(
        self,
        workspace_id: str,
        command_id: str,
        *,
        after_sequence: int = 0,
        limit: int = 500,
    ) -> list[OperationEvent]: ...


def require_commit_evidence(evidence: CommitEvidence) -> None:
    _require_git_sha(evidence.commit_sha, "commit_sha")
    if not evidence.branch.strip():
        raise ValueError("commit evidence requires a branch")


def require_pull_request_evidence(evidence: PullRequestEvidence) -> None:
    if evidence.number <= 0 or not evidence.url.strip():
        raise ValueError("pull request evidence requires number and URL")
    _require_git_sha(evidence.head_sha, "pull_request.head_sha")
    _require_git_sha(evidence.base_sha, "pull_request.base_sha")


def require_merge_evidence(evidence: MergeEvidence) -> None:
    _require_git_sha(evidence.merge_sha, "merge_sha")
    _require_git_sha(evidence.head_sha, "merge_head_sha")
    if not evidence.merged_at.strip():
        raise ValueError("merge evidence requires merged_at")


def require_sync_receipt(receipt: GitOpsSyncReceipt) -> None:
    if not receipt.sync_id.strip():
        raise ValueError("GitOps sync receipt requires sync_id")
    _require_git_sha(receipt.revision, "sync_revision")


def _require_git_sha(value: str, field_name: str) -> None:
    if GIT_SHA_PATTERN.fullmatch(value) is None:
        raise ValueError(f"{field_name} must be a canonical git SHA")
