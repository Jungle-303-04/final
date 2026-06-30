"""gitops 이벤트 body."""

from __future__ import annotations

from dataclasses import dataclass, field

from packages.config.constants import Target
from packages.contracts.event_bus.bodies.base import EventBody
from packages.contracts.event_bus.registry import event
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gitops import (
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_REPO_BRANCH,
    DEFAULT_REPO_REF,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
    ResourceClass,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID


@dataclass(frozen=True)
class Manifest(EventBody):
    """sandbox에 동기화할 배포 사양(값 객체)."""

    app: str
    image: str
    replicas: int
    namespace: str
    manifest_path: str = DEFAULT_MANIFEST_PATH


@dataclass(frozen=True)
class RenderedMetadata(EventBody):
    """렌더된 k8s manifest의 metadata 블록(값 객체)."""

    name: str
    namespace: str


@dataclass(frozen=True)
class RenderedSpec(EventBody):
    """렌더된 k8s manifest의 spec 블록(값 객체)."""

    replicas: int
    image: str


@dataclass(frozen=True)
class RenderedManifest(EventBody):
    """k8s Deployment 형태로 렌더된 manifest(값 객체)."""

    api_version: str = field(metadata={"payload_name": "apiVersion"})
    kind: str
    metadata: RenderedMetadata
    spec: RenderedSpec
    resource_class: str = ResourceClass.APPLICATION.value


@dataclass(frozen=True)
class Diff(EventBody):
    """원하는 상태와 실제 상태의 차이(값 객체)."""

    resource: str
    namespace: str
    desired_image: str
    actual_image: str
    risk: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    watch_target_id: str = DEFAULT_WATCH_TARGET_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    manifest_path: str = DEFAULT_MANIFEST_PATH
    resource_class: str = ResourceClass.APPLICATION.value


@event(EventSubject.GIT_WEBHOOK_RECEIVED)
@dataclass(frozen=True)
class GitWebhookReceivedBody(EventBody):
    """git.webhook.received — 깃 webhook 입력(gitops 입력)."""

    commit_sha: str
    image: str
    replicas: int
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    repo_ref: str = DEFAULT_REPO_REF
    branch: str = DEFAULT_REPO_BRANCH
    watch_target_id: str = DEFAULT_WATCH_TARGET_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    manifest_path: str = DEFAULT_MANIFEST_PATH


@event(EventSubject.GIT_CHANGED)
@dataclass(frozen=True)
class GitChangedBody(EventBody):
    """git.changed — 깃 변경 확정(원시 변경 정보)."""

    commit_sha: str
    image: str
    replicas: int
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    repo_ref: str = DEFAULT_REPO_REF
    branch: str = DEFAULT_REPO_BRANCH
    watch_target_id: str = DEFAULT_WATCH_TARGET_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    manifest_path: str = DEFAULT_MANIFEST_PATH


@event(EventSubject.MANIFEST_RENDERED)
@dataclass(frozen=True)
class ManifestRenderedBody(EventBody):
    """manifest.rendered — k8s manifest 렌더 결과."""

    rendered_manifest: RenderedManifest
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    watch_target_id: str = DEFAULT_WATCH_TARGET_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    commit_sha: str = ""
    manifest_path: str = DEFAULT_MANIFEST_PATH


@event(EventSubject.MANIFEST_INVALID)
@dataclass(frozen=True)
class ManifestInvalidBody(EventBody):
    """manifest.invalid — repo는 관찰됐지만 배포 가능한 manifest가 아님."""

    workspace_id: str
    repository_id: str
    watch_target_id: str
    binding_id: str
    commit_sha: str
    manifest_path: str
    reason: str


@event(EventSubject.DESIRED_DIFF_DETECTED)
@dataclass(frozen=True)
class DiffDetectedBody(EventBody):
    """desired.diff.detected — 적용해야 할 차이를 감지."""

    diff: Diff


@event(EventSubject.DIFF_ANALYZED)
@dataclass(frozen=True)
class DiffAnalyzedBody(EventBody):
    """diff.analyzed — diff 위험도 분석 결과."""

    diff: Diff
    safe: bool
    risk: str
    reason: str
