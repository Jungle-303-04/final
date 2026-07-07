"""RCA/agent event body 정의."""

from __future__ import annotations

from dataclasses import dataclass, field

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
    # 대표 symptom 외에 snapshot 에서 함께 관측된 신호 라벨 — triage 정보 손실 방지.
    secondary_symptoms: list[str] = field(default_factory=list)


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
    """evidence.built — 원본 증거를 Evidence로 정규화."""

    evidence: Evidence


@dataclass(frozen=True)
class EvidenceReference(EventBody):
    """RCA 판단에 사용된 세부 근거 참조."""

    evidence_ref: str
    source: str
    name: str
    check_id: str
    summary: str
    query: str | None = None


@dataclass(frozen=True)
class EvidenceItem(EventBody):
    """RCA 판단에 사용할 근거 하나."""

    source: str
    name: str
    value: JsonObject
    summary: str
    evidence_ref: str = ""
    check_id: str = ""
    query: str | None = None

    def reference(self) -> EvidenceReference:
        return EvidenceReference(
            evidence_ref=self.evidence_ref,
            source=self.source,
            name=self.name,
            check_id=self.check_id,
            summary=self.summary,
            query=self.query,
        )


@dataclass(frozen=True)
class EvidenceBundle(EventBody):
    """incident별 RCA 판단 근거 묶음."""

    incident_id: str
    items: list[EvidenceItem]
    missing_evidence: list[str]
    complete: bool
    missing_evidence_checks: list[MissingEvidenceCheck] = field(default_factory=list)


@event(EventSubject.EVIDENCE_BUNDLE_BUILT)
@dataclass(frozen=True)
class EvidenceBundleBuiltBody(EventBody):
    """evidence.bundle.built — IncidentRecord 기준 RCA 판단 근거 묶음."""

    evidence: Evidence
    incident: IncidentRecord
    evidence_bundle: EvidenceBundle


CAUSE_CANDIDATE_SOURCE_RULE = "rule"
CAUSE_CANDIDATE_SOURCE_AI_FALLBACK = "ai_fallback"


@dataclass(frozen=True)
class CauseCandidate(EventBody):
    """RCA 원인 후보."""

    candidate_id: str
    title: str
    description: str
    expected_evidence: list[str]
    checks: list[str]
    # 판별 신호 그룹(카탈로그 YAML `signals`) — 각 그룹은 {"id": str, "any_of": [matcher...]},
    # matcher 는 fact/log_pattern/event_pattern 중 하나(services.ai.agent.causes.signals 참조).
    # 그룹이 하나라도 미충족이면 해당 후보는 완결 점수(1.0)에 도달할 수 없다.
    signals: list[JsonObject] = field(default_factory=list)
    # 후보 출처 — rule 엔진("rule") 또는 LLM fallback("ai_fallback").
    source: str = CAUSE_CANDIDATE_SOURCE_RULE


@dataclass(frozen=True)
class CauseEvaluation(EventBody):
    """RCA 원인 후보 평가 결과."""

    candidate_id: str
    score: float
    checks: list[str]
    supporting_evidence: list[str]
    missing_evidence: list[str]
    reason: str
    supporting_evidence_refs: list[EvidenceReference] = field(default_factory=list)
    missing_evidence_checks: list[MissingEvidenceCheck] = field(default_factory=list)


@dataclass(frozen=True)
class MissingEvidenceCheck(EventBody):
    """RCA 확정에 필요한 근거 수집 상태."""

    check_id: str
    source: str
    status: str
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
    missing_evidence_checks: list[MissingEvidenceCheck] = field(default_factory=list)
    supporting_evidence_refs: list[EvidenceReference] = field(default_factory=list)


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
    """rca.backlog.created — RCA rule 개선 backlog 생성."""

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
    # AI fallback 결과가 rule 경로와 같은 rca-worker 계약(evidence 필수)을 지나도록 원본 증거를 동봉.
    evidence: Evidence | None = None


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


@event(EventSubject.RCA_ANALYSIS_BLOCKED)
@dataclass(frozen=True)
class RcaAnalysisBlockedBody(EventBody):
    """rca.analysis_blocked — 근거 부족/룰 부재로 RCA 자동 확정 불가."""

    reason_code: str
    reason: str
    evidence_ref: str
    rca_detail: RcaReportDetail
    workspace_id: str = DEFAULT_WORKSPACE_ID
    evidence: Evidence | None = None
    incident: IncidentRecord | None = None
    evidence_bundle: EvidenceBundle | None = None
    candidates: list[CauseCandidate] = field(default_factory=list)
    evaluations: list[CauseEvaluation] = field(default_factory=list)
    rule_missing: RcaRuleMissing | None = None
    missing_evidence: list[str] = field(default_factory=list)
    next_actions: list[JsonObject] = field(default_factory=list)
    diagnostics: JsonObject = field(default_factory=dict)
    severity: str = "warning"


@event(EventSubject.RCA_FOLLOWUP_REQUIRED)
@dataclass(frozen=True)
class RcaFollowupRequiredBody(EventBody):
    """rca.followup.required — RCA blocked/action/fallback 후속 조치 요청."""

    reason_code: str
    summary: str
    evidence_ref: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    severity: str = "warning"
    incident: IncidentRecord | None = None
    missing_evidence: list[str] = field(default_factory=list)
    next_actions: list[JsonObject] = field(default_factory=list)
    diagnostics: JsonObject = field(default_factory=dict)


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
    reason_code: str = "action_required"
    severity: str = "warning"
    missing_evidence: list[str] = field(default_factory=list)
    next_actions: list[JsonObject] = field(default_factory=list)
    diagnostics: JsonObject = field(default_factory=dict)


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
    """recovery.action_selected — 복구 후보 하나 선택됨."""

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
    request: JsonObject = field(default_factory=dict)
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT
    manifest_path: str = DEFAULT_MANIFEST_PATH
    approval_ref: str | None = None
    policy_decision_ref: str | None = None
    next_alert: JsonObject | None = None


@event(EventSubject.DIFF_EXPLAINED)
@dataclass(frozen=True)
class DiffExplainedBody(EventBody):
    """diff.explained — 패치 diff와 위험 설명."""

    summary: str
    risk: str
    details: JsonObject
    workspace_id: str = DEFAULT_WORKSPACE_ID
    ready_for_creation: bool = False
    reason: str = ""


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
