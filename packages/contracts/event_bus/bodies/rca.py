"""rca-worker 이벤트 body."""

from __future__ import annotations

from dataclasses import dataclass

from packages.contracts.event_bus.bodies.base import EventBody, JsonObject
from packages.contracts.event_bus.registry import events
from packages.contracts.event_bus.subjects import EventSubject


@events.reg(EventSubject.CLUSTER_EVIDENCE_RECEIVED)
@dataclass(frozen=True)
class ClusterEvidenceReceived(EventBody):
    """cluster.evidence.received — 에이전트가 보낸 증거(rca 입력)."""

    cluster_id: str
    kubernetes: JsonObject
    metrics: JsonObject
    logs: list[JsonObject]
    traces: JsonObject
    correlation_id: str | None = None


@dataclass(frozen=True)
class Evidence(EventBody):
    """RCA 입력 증거 번들(값 객체)."""

    cluster_id: str
    kubernetes: JsonObject
    metrics: JsonObject
    logs: list[JsonObject]
    traces: JsonObject
    object_ref: str


@events.reg(EventSubject.EVIDENCE_BUILT)
@dataclass(frozen=True)
class EvidenceBuiltBody(EventBody):
    """evidence.built — 증거 번들을 구성했다."""

    evidence: Evidence


@events.reg(EventSubject.RCA_COMPLETED)
@dataclass(frozen=True)
class RcaCompletedBody(EventBody):
    """rca.completed — 근본 원인과 권고 조치."""

    root_cause: str
    action: str
    evidence_ref: str
