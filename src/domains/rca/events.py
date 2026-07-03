"""RCA/agent event bodies."""

from __future__ import annotations

from dataclasses import dataclass

from packages.contracts.event_bus.bodies.base import EventBody, JsonObject
from packages.contracts.event_bus.registry import event
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.identity import DEFAULT_WORKSPACE_ID


@event(EventSubject.CLUSTER_EVIDENCE_RECEIVED)
@dataclass(frozen=True)
class ClusterEvidenceReceivedBody(EventBody):
    """cluster.evidence.received — 에이전트가 보낸 증거."""

    cluster_id: str
    kubernetes: JsonObject
    metrics: JsonObject
    logs: list[JsonObject]
    traces: JsonObject
    workspace_id: str = DEFAULT_WORKSPACE_ID
    agent_id: str | None = None
    source_id: str | None = None
    window_start: str | None = None
    evidence_key: str | None = None


@dataclass(frozen=True)
class Evidence(EventBody):
    """RCA 입력 증거 값 객체."""

    cluster_id: str
    kubernetes: JsonObject
    metrics: JsonObject
    logs: list[JsonObject]
    traces: JsonObject
    object_ref: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@dataclass(frozen=True)
class IncidentRecord(EventBody):
    """RCA 분석 대상 장애 증상."""

    incident_id: str
    cluster_id: str
    resource_kind: str
    resource_name: str
    namespace: str | None
    symptom: str
    severity: str
    first_seen_at: str | None
    summary: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.INCIDENT_DETECTED)
@dataclass(frozen=True)
class IncidentDetectedBody(EventBody):
    """incident.detected — 장애 플래그 판단 결과."""

    cluster_id: str
    detected: bool
    reason: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    severity: str | None = None
    affected: list[JsonObject] | None = None
    evidence: Evidence | None = None
    incident: IncidentRecord | None = None


@event(EventSubject.EVIDENCE_BUILT)
@dataclass(frozen=True)
class EvidenceBuiltBody(EventBody):
    """evidence.built — 원본 증거를 Evidence로 정규화했다."""

    evidence: Evidence


@dataclass(frozen=True)
class EvidenceItem(EventBody):
    """RCA 판단에 사용할 근거 하나."""

    source: str
    name: str
    value: JsonObject
    summary: str


@dataclass(frozen=True)
class EvidenceBundle(EventBody):
    """incident별 RCA 판단 근거 묶음."""

    incident_id: str
    items: list[EvidenceItem]
    missing_evidence: list[str]
    complete: bool


@event(EventSubject.EVIDENCE_BUNDLE_BUILT)
@dataclass(frozen=True)
class EvidenceBundleBuiltBody(EventBody):
    """evidence.bundle.built — IncidentRecord 기준 RCA 판단 근거를 묶었다."""

    evidence: Evidence
    incident: IncidentRecord
    evidence_bundle: EvidenceBundle


@dataclass(frozen=True)
class CauseCandidate(EventBody):
    """RCA 원인 후보."""

    candidate_id: str
    title: str
    description: str
    expected_evidence: list[str]
    checks: list[str]


@dataclass(frozen=True)
class CauseEvaluation(EventBody):
    """RCA 원인 후보 평가 결과."""

    candidate_id: str
    score: float
    checks: list[str]
    supporting_evidence: list[str]
    missing_evidence: list[str]
    reason: str


@dataclass(frozen=True)
class RcaReportDetail(EventBody):
    """RCA 최종 분석 상세 결과."""

    root_cause: str
    confidence: float
    selected_candidate_id: str
    supporting_evidence: list[str]
    missing_evidence: list[str]
    reason: str


@dataclass(frozen=True)
class RcaRuleMissing(EventBody):
    """대표 증상과 매칭되는 RCA rule이 없는 상태."""

    incident_id: str
    symptom: str
    evidence_ref: str
    missing_evidence: list[str]
    message: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.RCA_RULE_MISSING)
@dataclass(frozen=True)
class RcaRuleMissingBody(EventBody):
    """rca.rule_missing — 대표 증상과 매칭되는 RCA rule이 없음."""

    rule_missing: RcaRuleMissing
    incident: IncidentRecord


@event(EventSubject.RCA_BACKLOG_ITEM_CREATED)
@dataclass(frozen=True)
class RcaBacklogItemCreatedBody(EventBody):
    """rca.backlog.created — RCA rule 개선 backlog를 만든다."""

    backlog_id: str
    title: str
    reason: str
    evidence_ref: str
    incident_id: str
    symptom: str
    missing_evidence: list[str]
    status: str
    payload: JsonObject
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.RCA_AI_FALLBACK_REQUESTED)
@dataclass(frozen=True)
class RcaAiFallbackRequestedBody(EventBody):
    """rca.ai_fallback.requested — rule 미매칭 시 AI fallback 분석을 요청함."""

    reason: str
    evidence_ref: str
    incident: IncidentRecord
    evidence_bundle: EvidenceBundle
    missing_evidence: list[str]
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.RCA_CANDIDATES_PLANNED)
@dataclass(frozen=True)
class RcaCandidatesPlannedBody(EventBody):
    """rca.candidates.planned — 가능한 RCA 원인 후보 목록."""

    candidate_count: int
    evidence_ref: str
    candidates: list[CauseCandidate]
    workspace_id: str = DEFAULT_WORKSPACE_ID
    evidence: Evidence | None = None
    incident: IncidentRecord | None = None
    evidence_bundle: EvidenceBundle | None = None
    rule_missing: RcaRuleMissing | None = None


@event(EventSubject.RCA_CANDIDATES_EVALUATED)
@dataclass(frozen=True)
class RcaCandidatesEvaluatedBody(EventBody):
    """rca.candidates.evaluated — RCA 원인 후보 평가 결과."""

    candidate_count: int
    evidence_ref: str
    candidates: list[CauseCandidate]
    evaluations: list[CauseEvaluation]
    workspace_id: str = DEFAULT_WORKSPACE_ID
    evidence: Evidence | None = None
    incident: IncidentRecord | None = None
    evidence_bundle: EvidenceBundle | None = None
    rule_missing: RcaRuleMissing | None = None


@event(EventSubject.RCA_COMPLETED)
@dataclass(frozen=True)
class RcaCompletedBody(EventBody):
    """rca.completed — 근본 원인과 권고 조치."""

    root_cause: str
    action: str
    evidence_ref: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    evidence: Evidence | None = None
    incident: IncidentRecord | None = None
    evidence_bundle: EvidenceBundle | None = None
    candidates: list[CauseCandidate] | None = None
    evaluations: list[CauseEvaluation] | None = None
    rca_detail: RcaReportDetail | None = None
    rule_missing: RcaRuleMissing | None = None


@event(EventSubject.RCA_ACTION_REQUIRED)
@dataclass(frozen=True)
class RcaActionRequiredBody(EventBody):
    """rca.action_required — 자동 진행이 불가해 사람 조치가 필요."""

    reason: str
    evidence_ref: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@dataclass(frozen=True)
class HealingActionDraft(EventBody):
    """RCA 결과로 제안하는 복구 조치 초안."""

    action_type: str
    namespace: str
    resource_kind: str
    resource_name: str
    reason: str
    risk_level: str
    dry_run: bool
    source_evidence: list[str]
    params: JsonObject


@dataclass(frozen=True)
class RecoveryActionCandidate(EventBody):
    """사람/정책이 선택할 수 있는 복구 조치 후보."""

    action_id: str
    title: str
    description: str
    draft: HealingActionDraft
    route: str
    rank: int
    score: float
    risk_level: str
    blast_radius: str
    approval_required: bool
    prerequisites: list[str]
    validation_checks: list[str]
    rollback_plan: str
    evidence_refs: list[str]


@dataclass(frozen=True)
class RecoveryPlan(EventBody):
    """RCA 결과에서 파생된 복구 후보 묶음."""

    plan_id: str
    incident_id: str
    evidence_ref: str
    summary: str
    target: JsonObject
    recommended_action_id: str
    execution_route: str
    selection_required: bool
    candidates: list[RecoveryActionCandidate]


@event(EventSubject.RECOVERY_PLANNED)
@dataclass(frozen=True)
class RecoveryPlannedBody(EventBody):
    """recovery.planned — RCA 결과를 복구 계획으로 바꿈."""

    draft: HealingActionDraft
    plan: RecoveryPlan | None = None
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.RECOVERY_SELECTION_REQUESTED)
@dataclass(frozen=True)
class RecoverySelectionRequestedBody(EventBody):
    """recovery.selection_requested — 사람이 복구 후보를 선택해야 함."""

    plan: RecoveryPlan
    reason: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.RECOVERY_ACTION_SELECTED)
@dataclass(frozen=True)
class RecoveryActionSelectedBody(EventBody):
    """recovery.action_selected — 복구 후보 하나가 선택됐다."""

    plan: RecoveryPlan
    selected: RecoveryActionCandidate
    selected_by: str
    auto_selected: bool
    reason: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.SAFE_PR_PATCH_PREPARED)
@dataclass(frozen=True)
class SafePrPatchPreparedBody(EventBody):
    """safe_pr.patch_prepared — Safe PR에 담을 패치 초안."""

    title: str
    body: str
    patch: JsonObject
    provider: str
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.DIFF_EXPLAINED)
@dataclass(frozen=True)
class DiffExplainedBody(EventBody):
    """diff.explained — 패치 diff와 위험 설명."""

    summary: str
    risk: str
    details: JsonObject
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.ROLLOUT_DIAGNOSED)
@dataclass(frozen=True)
class RolloutDiagnosedBody(EventBody):
    """rollout.diagnosed — 롤아웃 상태 진단."""

    diagnosis: str
    next_action: str
    details: JsonObject
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.APPROVAL_RECOMMENDED)
@dataclass(frozen=True)
class ApprovalRecommendedBody(EventBody):
    """approval.recommended — 승인 보조 판단."""

    recommendation: str
    reason: str
    details: JsonObject
    workspace_id: str = DEFAULT_WORKSPACE_ID
