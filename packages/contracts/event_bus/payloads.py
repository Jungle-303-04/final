"""발행 이벤트 payload 계약(단일 출처).

네이밍 규칙:
- "<이벤트>Payload" = 한 이벤트의 본문 전체(예: GitChangedPayload).
- 접미사 없는 명사 = 본문 안에 끼워지는 값 객체(예: Manifest, Diff, Plan).
- 필드 이름이 곧 wire(json) 키. 카멜케이스가 필요하면
  field(metadata={"payload_name": "apiVersion"}) 로 별칭을 준다.
규칙: 입력은 Pydantic으로 검증, 출력(이 모듈)은 dataclass로 구성.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, fields
from typing import Any

from packages.contracts.event_bus.registry import events
from packages.contracts.event_bus.subjects import EventSubject

JsonObject = dict[str, Any]


@dataclass(frozen=True)
class EventPayload:
    """발행 이벤트 payload의 베이스.

    to_payload(): 객체 → wire dict(발행할 때).
    from_payload(): wire dict → 객체(구독해서 받을 때).
    """

    def to_payload(self) -> JsonObject:
        payload: JsonObject = {}
        for item in fields(self):
            key = item.metadata.get("payload_name", item.name)
            payload[key] = _to_payload_value(getattr(self, item.name))
        return payload

    @classmethod
    def from_payload(cls, raw: Mapping[str, Any]) -> EventPayload:
        values: JsonObject = {}
        for item in fields(cls):
            key = item.metadata.get("payload_name", item.name)
            values[item.name] = raw.get(key)
        return cls(**values)


def _to_payload_value(value: Any) -> Any:
    if isinstance(value, EventPayload):
        return value.to_payload()
    if isinstance(value, Mapping):
        return {key: _to_payload_value(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        return [_to_payload_value(item) for item in value]
    return value


# --- gitops-sync-worker ---
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


@dataclass(frozen=True)
class GitChangedPayload(EventPayload):
    """git.changed — 변경이 확정됐고 manifest를 만들었다."""

    commit_sha: str
    manifest: Manifest


@dataclass(frozen=True)
class ManifestRenderedPayload(EventPayload):
    """manifest.rendered — k8s manifest 렌더 결과."""

    rendered_manifest: RenderedManifest


@dataclass(frozen=True)
class DesiredDiffPayload(EventPayload):
    """desired.diff.detected — 적용해야 할 차이를 감지."""

    diff: Diff


@events.reg(EventSubject.COMMAND_REQUESTED)
@dataclass(frozen=True)
class CommandRequestedPayload(EventPayload):
    """command.requested — 이 diff를 sandbox에 적용해 달라."""

    cluster_id: str
    action: str
    namespace: str
    reason: str
    diff: Diff
    requested_by: str | None = None


# --- command-worker ---
@dataclass(frozen=True)
class Plan(EventPayload):
    """에이전트가 실행할 명령 계획(값 객체)."""

    command_id: str
    cluster_id: str
    action: str
    namespace: str
    steps: list[str]


@dataclass(frozen=True)
class Route(EventPayload):
    """명령을 보낼 경로(채널/클러스터, 값 객체)."""

    channel: str
    cluster_id: str


@events.reg(EventSubject.COMMAND_DISPATCH_READY)
@dataclass(frozen=True)
class CommandDispatchReadyPayload(EventPayload):
    """command.dispatch.ready — 정책 통과, 실행 계획 수립."""

    plan: Plan


@events.reg(EventSubject.COMMAND_DISPATCHED)
@dataclass(frozen=True)
class CommandDispatchedPayload(EventPayload):
    """command.dispatched — 대상 클러스터로 라우팅했다."""

    plan: Plan
    route: Route


@events.reg(EventSubject.COMMAND_QUEUED_FOR_AGENT)
@dataclass(frozen=True)
class CommandQueuedForAgentPayload(EventPayload):
    """command.queued_for_agent — 에이전트 폴링 큐에 적재."""

    command_id: str
    cluster_id: str


@events.reg(EventSubject.COMMAND_REJECTED)
@dataclass(frozen=True)
class CommandRejectedPayload(EventPayload):
    """command.rejected — 정책 위반으로 거부(원요청 첨부)."""

    reason: str
    requested: JsonObject


# --- rca-worker ---
@events.reg(EventSubject.CLUSTER_EVIDENCE_RECEIVED)
@dataclass(frozen=True)
class ClusterEvidenceReceived(EventPayload):
    """cluster.evidence.received — 에이전트가 보낸 증거(rca 입력)."""

    cluster_id: str
    kubernetes: JsonObject
    metrics: JsonObject
    logs: list[JsonObject]
    traces: JsonObject
    correlation_id: str | None = None


@dataclass(frozen=True)
class Evidence(EventPayload):
    """RCA 입력 증거 번들(값 객체)."""

    cluster_id: str
    kubernetes: JsonObject
    metrics: JsonObject
    logs: list[JsonObject]
    traces: JsonObject
    object_ref: str


@events.reg(EventSubject.EVIDENCE_BUILT)
@dataclass(frozen=True)
class EvidenceBuiltPayload(EventPayload):
    """evidence.built — 증거 번들을 구성했다."""

    evidence: Evidence


@events.reg(EventSubject.RCA_COMPLETED)
@dataclass(frozen=True)
class RcaCompletedPayload(EventPayload):
    """rca.completed — 근본 원인과 권고 조치."""

    root_cause: str
    action: str
    evidence_ref: str


@events.reg(EventSubject.SAFE_PR_CREATED)
@dataclass(frozen=True)
class SafePrCreatedPayload(EventPayload):
    """safe_pr.created — 안전한 롤백 PR을 만들었다."""

    pr_url: str
    provider: str
    token_ref: str
    mode: str


# --- dashboard-projection-service ---
@dataclass(frozen=True)
class DashboardUpdatedPayload(EventPayload):
    """dashboard.updated — 대시보드 카드가 갱신됐다."""

    summary: str
    status: str
