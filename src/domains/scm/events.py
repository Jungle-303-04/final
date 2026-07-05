"""SCM gateway event bodies.

Safe PR creation is centralized in scm-worker:
safe_pr.requested -> safe_pr.patch_prepared -> safe_pr.created/safe_pr.failed.
diff.explained is emitted from the patch-prepared event as an AI sidecar signal.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from domains.alert.events import AlertRequestedBody
from packages.contracts.event_bus.bodies.base import EventBody, JsonObject
from packages.contracts.event_bus.registry import event
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gitops import (
    DEFAULT_APPLICATION_ID,
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_ENVIRONMENT,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WORKFLOW_RUN_ID,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID


@dataclass(frozen=True)
class SafePrFilePatch(EventBody):
    """Safe PR branch에 커밋할 파일 변경."""

    path: str
    content: str
    description: str = ""


@event(EventSubject.SAFE_PR_REQUESTED)
@dataclass(frozen=True)
class SafePrRequestedBody(EventBody):
    """safe_pr.requested — PR 을 만들어 달라(제목/본문/공급자)."""

    title: str
    body: str
    provider: str
    patches: list[SafePrFilePatch] = field(default_factory=list)
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT
    manifest_path: str = DEFAULT_MANIFEST_PATH
    approval_ref: str | None = None
    policy_decision_ref: str | None = None
    next_alert: AlertRequestedBody | None = None


@event(EventSubject.SAFE_PR_READY_FOR_CREATION)
@dataclass(frozen=True)
class SafePrReadyForCreationBody(EventBody):
    """safe_pr.ready_for_creation — 패치/diff 설명이 끝나 PR 생성 가능."""

    title: str
    body: str
    provider: str
    diff_summary: str
    diff_risk: str
    diff_details: JsonObject
    patches: list[SafePrFilePatch] = field(default_factory=list)
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT
    manifest_path: str = DEFAULT_MANIFEST_PATH
    approval_ref: str | None = None
    policy_decision_ref: str | None = None
    next_alert: AlertRequestedBody | None = None


@event(EventSubject.SAFE_PR_CREATED)
@dataclass(frozen=True)
class SafePrCreatedBody(EventBody):
    """safe_pr.created — repo-gateway 가 PR 을 만들었다."""

    pr_url: str
    provider: str
    mode: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT


@event(EventSubject.SAFE_PR_FAILED)
@dataclass(frozen=True)
class SafePrFailedBody(EventBody):
    """safe_pr.failed — repo-gateway 가 PR 생성을 완료하지 못했다."""

    provider: str
    title: str
    reason: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT
