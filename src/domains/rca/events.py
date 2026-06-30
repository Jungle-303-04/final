"""rca-worker 이벤트 body."""

from __future__ import annotations

from dataclasses import dataclass

from packages.contracts.event_bus.bodies.base import EventBody, JsonObject
from packages.contracts.event_bus.registry import event
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.identity import DEFAULT_WORKSPACE_ID


@event(EventSubject.CLUSTER_EVIDENCE_RECEIVED)
@dataclass(frozen=True)
class ClusterEvidenceReceivedBody(EventBody):
    """cluster.evidence.received — 에이전트가 보낸 증거(rca 입력)."""

    cluster_id: str
    kubernetes: JsonObject
    metrics: JsonObject
    logs: list[JsonObject]
    traces: JsonObject
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.INCIDENT_DETECTED)
@dataclass(frozen=True)
class IncidentDetectedBody(EventBody):
    """incident.detected — 장애 플래그 판단 결과."""

    cluster_id: str
    detected: bool
    reason: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@dataclass(frozen=True)
class Evidence(EventBody):
    """RCA 입력 증거 번들(값 객체)."""

    cluster_id: str
    kubernetes: JsonObject
    metrics: JsonObject
    logs: list[JsonObject]
    traces: JsonObject
    object_ref: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.EVIDENCE_BUILT)
@dataclass(frozen=True)
class EvidenceBuiltBody(EventBody):
    """evidence.built — 증거 번들을 구성했다."""

    evidence: Evidence


@event(EventSubject.RCA_SCENARIOS_EVALUATED)
@dataclass(frozen=True)
class RcaScenariosEvaluatedBody(EventBody):
    """rca.scenarios.evaluated — RCA 후보 시나리오 평가 결과."""

    scenario_count: int
    selected: str
    confidence: str
    evidence_ref: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.RCA_COMPLETED)
@dataclass(frozen=True)
class RcaCompletedBody(EventBody):
    """rca.completed — 근본 원인과 권고 조치."""

    root_cause: str
    action: str
    evidence_ref: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.SAFE_PR_POLICY_DECIDED)
@dataclass(frozen=True)
class SafePrPolicyDecidedBody(EventBody):
    """safe_pr.policy_decided — PR/자동/승인필요/금지 라우팅 결정."""

    route: str
    reason: str
    evidence_ref: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.RCA_ACTION_REQUIRED)
@dataclass(frozen=True)
class RcaActionRequiredBody(EventBody):
    """rca.action_required — 자동 진행이 불가해 사람 조치가 필요."""

    reason: str
    evidence_ref: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
