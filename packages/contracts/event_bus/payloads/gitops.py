"""gitops-sync-worker 이벤트 payload."""

from __future__ import annotations

from dataclasses import dataclass, field

from packages.contracts.event_bus.payloads.base import EventPayload
from packages.contracts.event_bus.registry import events
from packages.contracts.event_bus.subjects import EventSubject


@dataclass(frozen=True)
class Manifest(EventPayload):
    """sandbox에 동기화할 배포 사양(값 객체)."""

    app: str
    image: str
    replicas: int
    namespace: str


@dataclass(frozen=True)
class RenderedMetadata(EventPayload):
    """렌더된 k8s manifest의 metadata 블록(값 객체)."""

    name: str
    namespace: str


@dataclass(frozen=True)
class RenderedSpec(EventPayload):
    """렌더된 k8s manifest의 spec 블록(값 객체)."""

    replicas: int
    image: str


@dataclass(frozen=True)
class RenderedManifest(EventPayload):
    """k8s Deployment 형태로 렌더된 manifest(값 객체)."""

    api_version: str = field(metadata={"payload_name": "apiVersion"})
    kind: str
    metadata: RenderedMetadata
    spec: RenderedSpec


@dataclass(frozen=True)
class Diff(EventPayload):
    """원하는 상태와 실제 상태의 차이(값 객체)."""

    resource: str
    namespace: str
    desired_image: str
    actual_image: str
    risk: str


@events.reg(EventSubject.GIT_WEBHOOK_RECEIVED)
@dataclass(frozen=True)
class GitWebhookReceived(EventPayload):
    """git.webhook.received — 깃 webhook 입력(gitops 입력)."""

    commit_sha: str
    image: str
    replicas: int


@events.reg(EventSubject.GIT_CHANGED)
@dataclass(frozen=True)
class GitChangedPayload(EventPayload):
    """git.changed — 깃 변경 확정(원시 변경 정보)."""

    commit_sha: str
    image: str
    replicas: int


@events.reg(EventSubject.MANIFEST_RENDERED)
@dataclass(frozen=True)
class ManifestRenderedPayload(EventPayload):
    """manifest.rendered — k8s manifest 렌더 결과."""

    rendered_manifest: RenderedManifest


@events.reg(EventSubject.DESIRED_DIFF_DETECTED)
@dataclass(frozen=True)
class DesiredDiffPayload(EventPayload):
    """desired.diff.detected — 적용해야 할 차이를 감지."""

    diff: Diff


@events.reg(EventSubject.DIFF_ANALYZED)
@dataclass(frozen=True)
class DiffAnalyzedPayload(EventPayload):
    """diff.analyzed — diff 위험도 분석 결과."""

    diff: Diff
    safe: bool
    risk: str
    reason: str
