"""rca-worker 이벤트 payload."""

from __future__ import annotations

from dataclasses import dataclass

from packages.contracts.event_bus.payloads.base import EventPayload, JsonObject
from packages.contracts.event_bus.registry import events
from packages.contracts.event_bus.subjects import EventSubject


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
