from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

JsonObject = dict[str, Any]


@dataclass(frozen=True)
class EventPayload:
    """발행 이벤트 payload의 베이스. to_payload()로 dict 직렬화."""

    def to_payload(self) -> JsonObject:
        return asdict(self)


# --- gitops-sync-worker ---
@dataclass(frozen=True)
class Manifest(EventPayload):
    app: str
    image: str
    replicas: int
    namespace: str


@dataclass(frozen=True)
class RenderedMetadata(EventPayload):
    name: str
    namespace: str


@dataclass(frozen=True)
class RenderedSpec(EventPayload):
    replicas: int
    image: str


@dataclass(frozen=True)
class RenderedManifest(EventPayload):
    apiVersion: str
    kind: str
    metadata: RenderedMetadata
    spec: RenderedSpec


@dataclass(frozen=True)
class Diff(EventPayload):
    resource: str
    namespace: str
    desired_image: str
    actual_image: str
    risk: str


@dataclass(frozen=True)
class GitChangedPayload(EventPayload):
    commit_sha: str
    manifest: Manifest


@dataclass(frozen=True)
class ManifestRenderedPayload(EventPayload):
    rendered_manifest: RenderedManifest


@dataclass(frozen=True)
class DesiredDiffPayload(EventPayload):
    diff: Diff


@dataclass(frozen=True)
class CommandRequestedPayload(EventPayload):
    cluster_id: str
    action: str
    namespace: str
    reason: str
    diff: Diff


# --- command-worker ---
@dataclass(frozen=True)
class Plan(EventPayload):
    command_id: str
    cluster_id: str
    action: str
    namespace: str
    steps: list[str]


@dataclass(frozen=True)
class Route(EventPayload):
    channel: str
    cluster_id: str


@dataclass(frozen=True)
class CommandDispatchReadyPayload(EventPayload):
    plan: Plan


@dataclass(frozen=True)
class CommandDispatchedPayload(EventPayload):
    plan: Plan
    route: Route


@dataclass(frozen=True)
class CommandQueuedForAgentPayload(EventPayload):
    command_id: str
    cluster_id: str


@dataclass(frozen=True)
class CommandRejectedPayload(EventPayload):
    reason: str
    requested: JsonObject


# --- rca-worker ---
@dataclass(frozen=True)
class Evidence(EventPayload):
    cluster_id: str
    kubernetes: JsonObject
    metrics: JsonObject
    logs: list[JsonObject]
    traces: JsonObject
    object_ref: str


@dataclass(frozen=True)
class EvidenceBuiltPayload(EventPayload):
    evidence: Evidence


@dataclass(frozen=True)
class RcaCompletedPayload(EventPayload):
    root_cause: str
    action: str
    evidence_ref: str


@dataclass(frozen=True)
class SafePrCreatedPayload(EventPayload):
    pr_url: str
    provider: str
    token_ref: str
    mode: str


# --- dashboard-projection-service ---
@dataclass(frozen=True)
class DashboardUpdatedPayload(EventPayload):
    summary: str
    status: str
