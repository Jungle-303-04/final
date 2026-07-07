from __future__ import annotations

from typing import Any

from pydantic import Field

from packages.contracts.gateway.base import StrictModel

JsonMap = dict[str, Any]


class HealthResponse(StrictModel):
    status: str
    service: str | None = None


class AcceptedResponse(StrictModel):
    accepted: bool
    event_id: str
    correlation_id: str


class AcceptedEventResponse(AcceptedResponse):
    event: JsonMap


class EventIdAcceptedResponse(StrictModel):
    accepted: bool
    event_id: str


class AuthSessionResponse(StrictModel):
    authenticated: bool
    user_id: str
    roles: list[str]
    workspace_id: str


class EmailVerificationResponse(StrictModel):
    accepted: bool
    verification_required: bool
    email: str | None = None


class UserApprovalResponse(StrictModel):
    accepted: bool
    user_id: str
    status: str
    role: str
    workspace_id: str


class LogoutResponse(StrictModel):
    authenticated: bool


class AgentCommandPollResponse(StrictModel):
    command: JsonMap | None


class CommandStartedResponse(StrictModel):
    accepted: bool
    correlation_id: str


class CommandHeartbeatResponse(StrictModel):
    accepted: bool
    correlation_id: str


class AgentDebugQueryResponse(StrictModel):
    accepted: bool
    command_id: str
    correlation_id: str


class CommandStatusResponse(StrictModel):
    """브라우저 콘솔이 명령 진행 상태·실제 결과를 조회하는 응답 — 가짜 완료 표시 금지 계약."""

    command_id: str
    cluster_id: str
    correlation_id: str
    action: str
    status: str
    result: dict[str, Any] = Field(default_factory=dict)
    completed_at: str | None = None


class RcaTimelineItem(StrictModel):
    workspace_id: str
    correlation_id: str
    cluster_id: str | None = None
    incident_id: str | None = None
    evidence_ref: str | None = None
    current_subject: str
    status: str
    root_cause: str | None = None
    confidence: float | None = None
    supporting_evidence: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    action_route: str | None = None
    command_id: str | None = None
    pr_url: str | None = None
    error_reason: str | None = None
    updated_at: str | None = None


class RcaTimelineResponse(StrictModel):
    items: list[RcaTimelineItem]


class RcaIncidentResponse(StrictModel):
    item: RcaTimelineItem


class EvidenceRecordItem(StrictModel):
    """저장된 evidence row 하나 — /evidence 범용 조회 응답 항목."""

    id: int
    workspace_id: str
    correlation_id: str
    kind: str
    payload: JsonMap = Field(default_factory=dict)
    created_at: str | None = None


class EvidenceQueryResponse(StrictModel):
    items: list[EvidenceRecordItem]
    limit: int
    offset: int
    has_more: bool


class RcaCandidateScoreItem(StrictModel):
    """원인 후보 1개의 평가 결과 — 카탈로그 메타(제목/출처) + 평가(점수/근거) 병합."""

    candidate_id: str
    title: str | None = None
    source: str | None = None  # rule | ai_fallback
    score: float | None = None
    reason: str | None = None
    supporting_evidence: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)


class RcaEvidenceRefItem(StrictModel):
    """판단에 실제 사용된 근거 참조 — 어떤 소스에 어떤 쿼리를 던져 얻었는지."""

    source: str
    name: str
    check_id: str | None = None
    summary: str | None = None
    query: str | None = None
    evidence_ref: str | None = None


class RcaMissingCheckItem(StrictModel):
    """확정에 필요하지만 미충족인 근거 수집 상태."""

    check_id: str
    source: str | None = None
    status: str | None = None
    reason: str | None = None


class RcaReportSummaryItem(StrictModel):
    """저장된 RCA report 요약 — payload 원문 대신 화이트리스트 필드만 노출(secret 유출 방지)."""

    id: int
    workspace_id: str
    correlation_id: str
    root_cause: str
    action: str
    incident_id: str | None = None
    cluster_id: str | None = None
    symptom: str | None = None
    severity: str | None = None
    confidence: float | None = None
    reason: str | None = None
    evidence_ref: str | None = None
    supporting_evidence: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    created_at: str | None = None
    # ── 분석 심화(화이트리스트) — 대상 리소스·부증상·후보 점수·근거 쿼리 트레일 ──
    resource_kind: str | None = None
    resource_name: str | None = None
    namespace: str | None = None
    secondary_symptoms: list[str] = Field(default_factory=list)
    selected_candidate_id: str | None = None
    candidates: list[RcaCandidateScoreItem] = Field(default_factory=list)
    supporting_evidence_refs: list[RcaEvidenceRefItem] = Field(default_factory=list)
    missing_evidence_checks: list[RcaMissingCheckItem] = Field(default_factory=list)


class RcaReportListResponse(StrictModel):
    items: list[RcaReportSummaryItem]
    limit: int
    offset: int
    has_more: bool


class EvidenceJobScheduleResponse(StrictModel):
    accepted: bool
    evidence_key: str
    queued: int
    job_ids: list[str]


class EvidenceJobPollResponse(StrictModel):
    job: JsonMap | None


class EvidenceJobResultResponse(StrictModel):
    accepted: bool
    evidence_key: str | None = None
    event_id: str | None = None
    correlation_id: str | None = None


class InventorySnapshotResponse(StrictModel):
    accepted: bool
    snapshot_id: str
    cluster_id: str
    resource_count: int
    marked_deleted: int = 0
    resource_types: list[str] = Field(default_factory=list)


class InventoryResourceResponse(StrictModel):
    inventory_key: str
    snapshot_id: str
    workspace_id: str
    cluster_id: str
    resource_type: str
    api_version: str
    kind: str
    namespace: str | None = None
    name: str
    uid: str | None = None
    resource_version: str | None = None
    status: str
    health: str
    labels: JsonMap = Field(default_factory=dict)
    annotations: JsonMap = Field(default_factory=dict)
    summary: JsonMap = Field(default_factory=dict)
    raw: JsonMap = Field(default_factory=dict)
    observed_at: str | None = None
    first_seen_at: str | None = None
    last_seen_at: str | None = None
    deleted_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class InventoryResourceListResponse(StrictModel):
    cluster_id: str
    resource_type: str | None = None
    resources: list[InventoryResourceResponse]


class ClusterUsageSample(StrictModel):
    sampled_at: str | None = None
    usage: JsonMap = Field(default_factory=dict)


class ClusterUsageResponse(StrictModel):
    cluster_id: str
    samples: list[ClusterUsageSample] = Field(default_factory=list)


class InventorySummaryResponse(StrictModel):
    cluster_id: str
    latest_snapshot: JsonMap | None = None
    counts: list[JsonMap] = Field(default_factory=list)


class FleetClusterSummaryItem(StrictModel):
    """fleet 화면 클러스터 1개 롤업 — health 는 healthy|warning|critical."""

    cluster_id: str
    name: str
    health: str
    pods_running: int = 0
    pods_total: int = 0
    nodes_ready: int = 0
    nodes_total: int = 0
    open_incidents: int = 0
    restarts_recent: int = 0
    # 실측 활용률(%) — agent usage 롤업에 값이 없으면 None(합성 값 금지).
    cpu_pct: float | None = None
    mem_pct: float | None = None
    last_seen_at: str | None = None


class FleetTotals(StrictModel):
    """fleet 상단 카드 합계 — dead_letters 는 플랫폼 전역 카운트(내용 비노출)."""

    clusters: int = 0
    healthy: int = 0
    warning: int = 0
    critical: int = 0
    open_incidents: int = 0
    pending_approvals: int = 0
    running_workflows: int = 0
    dead_letters: int = 0


class FleetSummaryResponse(StrictModel):
    clusters: list[FleetClusterSummaryItem] = Field(default_factory=list)
    totals: FleetTotals = Field(default_factory=FleetTotals)


class ClusterWorkloadHealthItem(StrictModel):
    """드릴다운 워크로드 1개 — ready 는 "ready/desired" 문자열(inventory status)."""

    name: str
    kind: str
    namespace: str | None = None
    health: str
    ready: str = ""
    restarts: int = 0


class ClusterWarningEventItem(StrictModel):
    namespace: str | None = None
    name: str
    reason: str | None = None
    message: str | None = None
    involved_kind: str | None = None
    involved_name: str | None = None
    count: int = 0
    last_seen_at: str | None = None


class ClusterOpenIncidentItem(StrictModel):
    incident_id: str
    correlation_id: str
    symptom: str | None = None
    root_cause: str | None = None
    status: str
    created_at: str | None = None


class ClusterUsageSnapshot(StrictModel):
    """최신 usage 롤업 1건 — agent 가 관측한 값만(없으면 None/0)."""

    sampled_at: str | None = None
    pods_running: int = 0
    pods_total: int = 0
    nodes_ready: int = 0
    nodes_total: int = 0
    restart_total: int = 0
    cpu_pct: float | None = None
    mem_pct: float | None = None


class ClusterSummaryDetailResponse(StrictModel):
    cluster_id: str
    name: str
    health: str
    # health 값("healthy"/"degraded"/"unknown") → 워크로드 목록 그룹.
    workloads: dict[str, list[ClusterWorkloadHealthItem]] = Field(default_factory=dict)
    warning_events: list[ClusterWarningEventItem] = Field(default_factory=list)
    open_incidents: list[ClusterOpenIncidentItem] = Field(default_factory=list)
    usage: ClusterUsageSnapshot | None = None


class TargetInstallResponse(StrictModel):
    registered: bool
    cluster_id: str
    status: str
    applied: bool
    apply_output: str | None
    install_manifest: str
    # 이 클러스터의 per-cluster agent 토큰(원문). 등록 관리자에게 1회 반환 —
    # agent 배포 secret 주입 및 agent 인증(x-agent-token)에 사용. 서버는 해시만 저장.
    agent_token: str
    # 원라인 설치 명령 — curl <base>/install/<token> | kubectl apply -f -
    install_command: str = ""


class ClusterAgentStatus(StrictModel):
    workspace_id: str
    cluster_id: str
    agent_id: str
    status: str
    capabilities: list[str] = Field(default_factory=list)
    details: JsonMap = Field(default_factory=dict)
    last_seen_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ClusterSummary(StrictModel):
    workspace_id: str
    cluster_id: str
    name: str
    environment: str
    status: str
    settings: JsonMap = Field(default_factory=dict)
    connection_status: str
    last_agent_id: str | None = None
    last_agent_seen_at: str | None = None
    node_count: int = 0
    pod_count: int = 0
    incident_count: int = 0
    created_at: str | None = None
    updated_at: str | None = None


class ClusterListResponse(StrictModel):
    clusters: list[ClusterSummary]


class ClusterResponse(StrictModel):
    cluster: ClusterSummary
    agents: list[ClusterAgentStatus] = Field(default_factory=list)


class ClusterConnectionStatusResponse(StrictModel):
    cluster_id: str
    connection_status: str
    last_agent_id: str | None = None
    last_seen_at: str | None = None
    agents: list[ClusterAgentStatus] = Field(default_factory=list)


class AlertChannelResponse(StrictModel):
    channel_id: str
    workspace_id: str
    name: str
    kind: str
    url: str
    min_severity: str
    enabled: bool
    created_at: str | None = None
    updated_at: str | None = None


class AlertChannelListResponse(StrictModel):
    channels: list[AlertChannelResponse] = Field(default_factory=list)


class DeadLettersResponse(StrictModel):
    dead_letters: list[JsonMap]


class DeadLetterReplayResponse(StrictModel):
    accepted: bool
    dead_letter_id: int
    replay_event: JsonMap


class AiConversationAcceptedResponse(StrictModel):
    accepted: bool
    conversation_id: str
    message_id: str
    event_id: str
    correlation_id: str


class AiConversationResponse(StrictModel):
    conversation: JsonMap
    messages: list[JsonMap]


class AiConversationListResponse(StrictModel):
    conversations: list[JsonMap]


class ApplicationResponse(StrictModel):
    application: JsonMap


class ApplicationListResponse(StrictModel):
    applications: list[JsonMap]


class DeploymentBindingResponse(StrictModel):
    deployment: JsonMap


class DeploymentBindingListResponse(StrictModel):
    deployments: list[JsonMap]


class WorkflowRunListResponse(StrictModel):
    runs: list[JsonMap]


class CatalogItemListResponse(StrictModel):
    items: list[JsonMap]


class CatalogItemResponse(StrictModel):
    item: JsonMap


class CatalogInstallRunResponse(StrictModel):
    install: JsonMap


class ProviderCatalogResponse(StrictModel):
    providers: dict[str, list[JsonMap]]


class ProviderValidationResponse(StrictModel):
    valid: bool
    errors: list[str]
    warnings: list[str]
    selected: dict[str, JsonMap]
