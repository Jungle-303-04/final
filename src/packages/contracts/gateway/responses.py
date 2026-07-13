from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from packages.contracts.gateway.base import StrictModel

JsonMap = dict[str, Any]
AuditJourneyStage = Literal[
    "alert",
    "evidence",
    "rca",
    "recovery",
    "command",
    "pr",
    "workflow",
    "cluster",
    "ai",
    "notification",
    "system",
    "unknown",
]


class HealthResponse(StrictModel):
    status: str
    service: str | None = None


class AcceptedResponse(StrictModel):
    accepted: bool
    event_id: str
    correlation_id: str
    command_id: str | None = None


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


class EmailCheckResponse(StrictModel):
    available: bool
    reason_code: str = ""
    detail: str = ""
    retry_after: int | None = None


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
    """브라우저 콘솔이 명령 진행 상태·실제 결과를 조회하는 응답 — 임의 완료 표시 금지 계약."""

    command_id: str
    cluster_id: str
    correlation_id: str
    action: str
    status: str
    result: dict[str, Any] = Field(default_factory=dict)
    completed_at: str | None = None


class SchedulingPolicyResponse(StrictModel):
    accepted: bool = True
    cluster_id: str
    scheduling: JsonMap = Field(default_factory=dict)


class MetricQueryPresetItem(StrictModel):
    preset_id: str
    workspace_id: str
    cluster_id: str
    name: str
    description: str = ""
    source: str
    query: str
    range_seconds: int | None = None
    step_seconds: int | None = None
    unit: str = ""
    metadata: JsonMap = Field(default_factory=dict)
    created_by: str
    created_at: str | None = None
    updated_at: str | None = None


class MetricQueryPresetListResponse(StrictModel):
    items: list[MetricQueryPresetItem] = Field(default_factory=list)


class MetricQueryPresetResponse(StrictModel):
    item: MetricQueryPresetItem


class MetricWidgetItem(StrictModel):
    widget_id: str
    workspace_id: str
    cluster_id: str
    query_preset_id: str
    title: str
    kind: str
    position: JsonMap = Field(default_factory=dict)
    settings: JsonMap = Field(default_factory=dict)
    created_by: str
    created_at: str | None = None
    updated_at: str | None = None


class MetricWidgetListResponse(StrictModel):
    items: list[MetricWidgetItem] = Field(default_factory=list)


class MetricWidgetResponse(StrictModel):
    item: MetricWidgetItem


class RcaTimelineItem(StrictModel):
    workspace_id: str
    correlation_id: str
    cluster_id: str | None = None
    incident_id: str | None = None
    incident_namespace: str | None = None
    incident_resource_kind: str | None = None
    incident_resource_name: str | None = None
    incident_symptom: str | None = None
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


class AuditTimelineItem(StrictModel):
    event_id: str = Field(min_length=1)
    subject: str
    source: str
    created_at: str
    causation_id: str | None = None
    journey_stage: AuditJourneyStage
    payload_summary: JsonMap = Field(default_factory=dict)


class AuditTimelineResponse(StrictModel):
    items: list[AuditTimelineItem] = Field(default_factory=list)
    limit: int
    has_more: bool
    next_cursor: str | None = None


class RecentChangeItem(StrictModel):
    event_id: str
    changed_at: str
    namespace: str
    resource_kind: str
    resource_name: str
    image_before: str | None = None
    image_after: str | None = None
    pr_url: str | None = None
    commit_sha: str
    repository_id: str
    repo_ref: str
    workflow_run_id: str


class RecentChangeListResponse(StrictModel):
    incident_id: str
    items: list[RecentChangeItem] = Field(default_factory=list)
    limit: int


class RcaIncidentResponse(StrictModel):
    item: RcaTimelineItem


class EvidenceSourceSummaryItem(StrictModel):
    """저장된 evidence 원문에서 추출한 안전 요약 — raw payload 값은 제외."""

    source: str
    summary: str
    schema_version: int | None = None
    collector: str | None = None
    collector_version: str | None = None
    source_version: str | None = None
    query_version: str | None = None
    collected_at: str | None = None
    evidence_key: str | None = None
    source_id: str | None = None
    agent_id: str | None = None
    window_start: str | None = None


class EvidenceRecordItem(StrictModel):
    """저장된 evidence row 하나 — raw payload 대신 안전 요약만 노출."""

    id: int
    workspace_id: str
    correlation_id: str
    kind: str
    cluster_id: str | None = None
    evidence_ref: str | None = None
    summary: str
    sources: list[EvidenceSourceSummaryItem] = Field(default_factory=list)
    created_at: str | None = None


class EvidenceQueryResponse(StrictModel):
    items: list[EvidenceRecordItem]
    limit: int
    offset: int
    has_more: bool
    next_cursor: str | None = None


class EvidenceWindowSummaryItem(StrictModel):
    """저장된 evidence window 목록 — 원문 payload 없이 source 존재 여부만 노출."""

    evidence_key: str
    workspace_id: str
    cluster_id: str | None = None
    source_id: str | None = None
    window_start: str | None = None
    agent_id: str | None = None
    correlation_id: str | None = None
    sources: list[str] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


class EvidenceWindowListResponse(StrictModel):
    items: list[EvidenceWindowSummaryItem]
    limit: int
    offset: int
    has_more: bool


class EvidenceWindowPayloadResponse(StrictModel):
    """저장된 evidence window 원문 조회 — RCA 스키마 확정용 read-only debug 응답."""

    evidence_key: str
    workspace_id: str
    cluster_id: str | None = None
    source: str | None = None
    payload: JsonMap


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
    schema_version: int | None = None
    source_version: str | None = None
    collector: str | None = None
    collector_version: str | None = None
    query_version: str | None = None
    collected_at: str | None = None
    evidence_key: str | None = None
    source_id: str | None = None
    agent_id: str | None = None
    window_start: str | None = None


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
    next_cursor: str | None = None


class RecoveryActionCandidateItem(StrictModel):
    action_id: str
    title: str
    description: str
    route: str
    rank: int
    score: float
    risk_level: str
    blast_radius: str
    approval_required: bool
    prerequisites: list[str] = Field(default_factory=list)
    validation_checks: list[str] = Field(default_factory=list)
    rollback_plan: str
    evidence_refs: list[str] = Field(default_factory=list)


class RecoveryPlanStatusResponse(StrictModel):
    plan_id: str
    correlation_id: str
    incident_id: str
    evidence_ref: str
    status: str
    summary: str
    target: JsonMap = Field(default_factory=dict)
    recommended_action_id: str
    execution_route: str
    selection_required: bool
    selected_action_id: str | None = None
    selected_by: str | None = None
    selected_action: RecoveryActionCandidateItem | None = None
    candidates: list[RecoveryActionCandidateItem] = Field(default_factory=list)


class RemediationBundleMeta(StrictModel):
    correlation_id: str
    incident_id: str | None
    cluster_id: str
    workspace_id: str
    created_at: str | None


class RemediationBundleDiagnosis(StrictModel):
    root_cause: str
    confidence: float | None
    supporting_evidence: list[str]
    missing_evidence: list[str]
    supporting_evidence_refs: list[RcaEvidenceRefItem]
    missing_evidence_checks: list[RcaMissingCheckItem]
    selected_candidate_id: str | None


class RemediationBundleActionDraft(StrictModel):
    action_type: str
    namespace: str
    resource_kind: str
    resource_name: str
    reason: str
    risk_level: str
    dry_run: bool
    source_evidence: list[str]
    params: JsonMap


class RemediationBundleRecoveryCandidate(StrictModel):
    action_id: str
    title: str
    description: str
    draft: RemediationBundleActionDraft
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


class RemediationBundleRemediation(StrictModel):
    status: str
    selected_action_id: str | None
    selected_by: str | None
    candidates: list[RemediationBundleRecoveryCandidate]
    evidence_ref: str


class RemediationBundleResponse(StrictModel):
    meta: RemediationBundleMeta
    diagnosis: RemediationBundleDiagnosis
    remediation: RemediationBundleRemediation | None


class RcaTestScenarioExpectedItem(StrictModel):
    root_cause: str
    symptom: str


class RcaTestScenarioSafetyItem(StrictModel):
    namespace: Literal["sandbox"]
    cleanup_required: Literal[True]
    ttl_seconds: int
    management_cluster_allowed: Literal[False]
    resource_name_prefix: Literal["rca-test-"]
    max_concurrent_runs: int


class RcaTestScenarioAdapterItem(StrictModel):
    adapter: Literal[
        "kubernetes.deployment",
        "gitops.fixture",
        "external.fixture",
        "kubernetes.manifest_delete",
        "fixture.reset",
    ]
    params: JsonMap = Field(default_factory=dict)


class RcaTestScenarioObservationItem(StrictModel):
    timeout_seconds: int
    poll_seconds: int
    pod_waiting_reasons: list[str] = Field(default_factory=list)
    pod_terminated_reasons: list[str] = Field(default_factory=list)
    event_reasons: list[str] = Field(default_factory=list)
    event_message_any: list[str] = Field(default_factory=list)
    log_message_any: list[str] = Field(default_factory=list)
    deployment_condition_reasons: list[str] = Field(default_factory=list)
    external_status_any: list[str] = Field(default_factory=list)


class RcaTestScenarioItem(StrictModel):
    scenario_id: str
    version: int
    title: str
    description: str
    execution: Literal["real", "hybrid", "external"]
    availability: Literal[
        "ready",
        "verification_pending",
        "fixture_required",
        "detector_gap",
    ]
    availability_reason: str | None = None
    verification_work_needed: list[str] = Field(default_factory=list)
    fixture_requirements: list[str] = Field(default_factory=list)
    detector_work_needed: list[str] = Field(default_factory=list)
    expected: RcaTestScenarioExpectedItem
    evidence_sources: list[Literal["kubernetes", "metrics", "logs", "traces", "metadata"]]
    safety: RcaTestScenarioSafetyItem
    trigger: RcaTestScenarioAdapterItem
    observe: RcaTestScenarioObservationItem
    cleanup: RcaTestScenarioAdapterItem


class RcaTestScenarioListResponse(StrictModel):
    items: list[RcaTestScenarioItem] = Field(default_factory=list)


class RcaTestRunResponse(StrictModel):
    accepted: bool = True
    run_id: str
    scenario_id: str
    scenario_version: int
    cluster_id: str
    correlation_id: str
    command_id: str
    evidence_key: str
    status: str
    cleanup_at: str
    verification_mode: bool = False
    failure: JsonMap | None = None
    steps: list[JsonMap] = Field(default_factory=list)


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


class InventoryResourceDetailResponse(StrictModel):
    """단일 Kubernetes 리소스 드릴다운 — raw object 없이 실제 read model 관계만 노출."""

    cluster_id: str
    identity: JsonMap
    resource: InventoryResourceResponse
    related: dict[str, list[InventoryResourceResponse]] = Field(default_factory=dict)
    events: list[InventoryResourceResponse] = Field(default_factory=list)


FilterCountCompleteness = Literal["exact", "partial", "unavailable"]
FilterFacetAvailability = Literal["available", "restricted", "unresolved"]
FilterFacetAxis = Literal["clusters", "namespaces", "applications"]
FilterSurface = Literal["resources", "issues", "applications", "gitops", "checks"]


class ClusterFilterFacetItem(StrictModel):
    axis: Literal["cluster"] = "cluster"
    value: str = Field(min_length=1)
    cluster_id: str = Field(min_length=1)
    name: str | None = None
    provider: str | None = None
    availability: FilterFacetAvailability


class NamespaceFilterFacetItem(StrictModel):
    axis: Literal["namespace"] = "namespace"
    value: str = Field(min_length=1)
    cluster_id: str = Field(min_length=1)
    namespace: str = Field(min_length=1)
    availability: FilterFacetAvailability


class ApplicationFilterFacetItem(StrictModel):
    axis: Literal["application"] = "application"
    value: str = Field(min_length=1)
    application_id: str = Field(min_length=1)
    name: str | None = None
    environment: str | None = None
    availability: FilterFacetAvailability


class SelectedFilterFacetResolution(StrictModel):
    axis: Literal["cluster", "namespace", "application"]
    value: str = Field(min_length=1)
    status: Literal["resolved", "restricted", "unresolved", "unavailable"]
    display_label: str | None = None


class FilterResultCounts(StrictModel):
    filtered_count: int | None = Field(default=None, ge=0)
    unfiltered_count: int | None = Field(default=None, ge=0)
    filtered_count_completeness: FilterCountCompleteness
    unfiltered_count_completeness: FilterCountCompleteness


class FilterSnapshotMeta(StrictModel):
    snapshot_revision: int = Field(ge=0)
    authorization_revision: str = Field(min_length=1)
    filter_fingerprint: str = Field(min_length=1)
    observed_at: str | None = None
    stale: bool
    partial_reason_codes: list[str] = Field(default_factory=list)


class ResourceFilterFacetPageResponse(StrictModel):
    axis: FilterFacetAxis
    items: list[ClusterFilterFacetItem | NamespaceFilterFacetItem | ApplicationFilterFacetItem] = (
        Field(default_factory=list)
    )
    selected_resolutions: list[SelectedFilterFacetResolution] = Field(default_factory=list)
    next_cursor: str | None = None
    has_more: bool
    snapshot: FilterSnapshotMeta


class InventoryResourceClusterIdentity(StrictModel):
    cluster_id: str = Field(min_length=1)
    name: str | None = None
    provider: str | None = None


class FilteredInventoryResourceItem(StrictModel):
    resource: InventoryResourceResponse
    cluster: InventoryResourceClusterIdentity
    application_ids: list[str] = Field(default_factory=list)
    application_binding_completeness: FilterCountCompleteness


class FilteredInventoryResourceListResponse(StrictModel):
    items: list[FilteredInventoryResourceItem] = Field(default_factory=list)
    next_cursor: str | None = None
    has_more: bool
    counts: FilterResultCounts
    snapshot: FilterSnapshotMeta


class LabelSelector(StrictModel):
    key: str = Field(min_length=1)
    value: str
    selector: str = Field(min_length=2)


class LabelFacetItem(LabelSelector):
    match_count: int | None = Field(default=None, ge=0)
    count_completeness: FilterCountCompleteness


class SelectedLabelResolution(LabelSelector):
    status: Literal["resolved", "zero", "restricted", "unavailable"]


class LabelFacetPageResponse(StrictModel):
    surface: FilterSurface
    items: list[LabelFacetItem] = Field(default_factory=list)
    selected_resolutions: list[SelectedLabelResolution] = Field(default_factory=list)
    next_cursor: str | None = None
    has_more: bool
    counts: FilterResultCounts
    snapshot: FilterSnapshotMeta


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
    """fleet 화면 클러스터 1개 롤업 — health 는 healthy|warning|critical|stale|unknown."""

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
    stale: int = 0
    unknown: int = 0
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
    namespace: str | None = None
    resource_kind: str | None = None
    resource_name: str | None = None
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


class NodeSummaryItem(StrictModel):
    name: str
    ready: bool
    health: str
    pods_running: int = 0
    pods_capacity: int = 0
    cpu_pct: float | None = None
    mem_pct: float | None = None
    restarts_recent: int = 0
    conditions: list[str] = Field(default_factory=list)


class ClusterNodesSummaryResponse(StrictModel):
    cluster_id: str
    nodes: list[NodeSummaryItem] = Field(default_factory=list)


class PodSummaryItem(StrictModel):
    name: str
    namespace: str
    phase: str
    health: str
    ready: str = "0/0"
    restarts: int = 0
    owner_kind: str | None = None
    owner_name: str | None = None
    cpu_mcores: float | None = None
    mem_mib: float | None = None
    incident_correlation_id: str | None = None


class NodePodsSummaryResponse(StrictModel):
    cluster_id: str
    node_name: str
    pods: list[PodSummaryItem] = Field(default_factory=list)


class BootstrapStep(StrictModel):
    label: str
    command: str


class ManagementAccessResponse(StrictModel):
    mode: Literal["portforward", "loadbalancer", "ingress", "nodeport", "unknown"] = "unknown"
    external_url: str | None = None
    agent_server_url: str = ""
    reachability: Literal["external", "self_only"] = "self_only"
    limitation_reason: Literal["external_url_not_configured"] | None = None


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
    # provider별 설치 명령. 새 UI는 이 값을 우선 사용하고 없으면 install_command로 fallback.
    bootstrap_command: str = ""
    bootstrap_steps: list[BootstrapStep] = Field(default_factory=list)
    connect_timeout_seconds: int | None = None
    connect_expires_at: str | None = None
    connection_stage: str | None = None
    management_access: ManagementAccessResponse | None = None


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
    provider: str | None = None
    connection_stage: str | None = None
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
    connection_stage: str | None = None
    last_agent_id: str | None = None
    last_seen_at: str | None = None
    agents: list[ClusterAgentStatus] = Field(default_factory=list)
    connect_timeout_seconds: int | None = None
    connect_expires_at: str | None = None


class AlertChannelResponse(StrictModel):
    channel_id: str
    workspace_id: str
    name: str
    kind: str
    url: str
    min_severity: str
    enabled: bool
    last_tested_at: str | None = None
    last_test_status: str | None = None
    last_test_detail: str | None = None
    last_test_status_code: int | None = None
    created_at: str | None = None
    updated_at: str | None = None


class AlertChannelListResponse(StrictModel):
    channels: list[AlertChannelResponse] = Field(default_factory=list)


class ValidationErrorItem(StrictModel):
    code: str
    detail: str
    line: int | None = None


class AlertChannelTestResponse(StrictModel):
    valid: bool
    delivered: bool = False
    code: str | None = None
    detail: str = ""
    status_code: int | None = None
    channel: AlertChannelResponse | None = None


class RcaRuleValidateResponse(StrictModel):
    valid: bool
    errors: list[ValidationErrorItem] = Field(default_factory=list)
    matched_symptom: str | None = None
    candidates_count: int = 0


class RcaRuleCandidateItem(StrictModel):
    candidate_id: str
    title: str
    expected_evidence: list[str] = Field(default_factory=list)
    signals_count: int = 0


class RcaRuleCatalogItem(StrictModel):
    rule_id: str
    symptoms: list[str] = Field(default_factory=list)
    required_sources: list[str] = Field(default_factory=list)
    candidates: list[RcaRuleCandidateItem] = Field(default_factory=list)


class RcaRuleCatalogResponse(StrictModel):
    items: list[RcaRuleCatalogItem] = Field(default_factory=list)
    rules_count: int = 0
    candidates_count: int = 0


class MetricsValidateResponse(StrictModel):
    valid: bool
    code: str | None = None
    detail: str = ""
    result_type: str | None = None


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


class RepositoryProbeResponse(StrictModel):
    repo_ref: str
    normalized_repo_ref: str
    valid: bool
    reachable: bool
    default_branch: str | None = None
    private: bool | None = None
    html_url: str | None = None
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class RepoValidateResponse(StrictModel):
    accessible: bool
    private: bool | None = None
    default_branch: str | None = None
    normalized: str
    reason: str | None = None
    code: str | None = None
    credential_ref: str | None = None


class RepositoryBranchItem(StrictModel):
    name: str
    protected: bool = False
    default: bool = False


class RepositoryBranchListResponse(StrictModel):
    repo_ref: str
    default_branch: str | None = None
    branches: list[RepositoryBranchItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RepositoryManifestCandidate(StrictModel):
    path: str
    source_type: str
    display_name: str
    reason: str = ""


class RepositoryManifestCandidateListResponse(StrictModel):
    repo_ref: str
    branch: str
    candidates: list[RepositoryManifestCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RepoManifestFile(StrictModel):
    path: str
    kinds: list[str] = Field(default_factory=list)


class RepoManifestFileListResponse(StrictModel):
    repo: str
    branch: str
    manifests: list[RepoManifestFile] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RepositoryManifestResource(StrictModel):
    api_version: str = ""
    kind: str
    namespace: str | None = None
    name: str


class RepositoryManifestValidationResponse(StrictModel):
    repo_ref: str
    branch: str
    manifest_path: str
    valid: bool
    status: str
    validation_mode: str
    resource_count: int = 0
    resources: list[RepositoryManifestResource] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class DeploymentBindingResponse(StrictModel):
    deployment: JsonMap


class DeploymentBindingListResponse(StrictModel):
    deployments: list[JsonMap]


class PromotionGateResponse(StrictModel):
    eligible: bool
    command_status: str
    command_completed: bool
    applied: bool | None = None
    applied_not_false: bool
    failed_resources: list[JsonMap] = Field(default_factory=list)
    failed_resource_count: int = 0
    rollout_ready: bool | None = None
    rollout_ready_not_false: bool


class WorkflowRunItemResponse(BaseModel):
    """기존 동적 run payload를 보존하면서 promotion gate만 구조화한다."""

    model_config = ConfigDict(extra="allow")

    promotion_gate: PromotionGateResponse | None = None


class WorkflowRunListResponse(StrictModel):
    runs: list[WorkflowRunItemResponse]


class ReleasePlanResponse(StrictModel):
    plan: JsonMap


class ReleasePlanListResponse(StrictModel):
    plans: list[JsonMap]


class ReleasePlanPreviewResponse(StrictModel):
    preview: JsonMap


class GeneratedManifestFile(StrictModel):
    path: str
    content: str
    action: str = "upsert"
    description: str = ""


class GeneratedManifestResource(StrictModel):
    api_version: str = ""
    kind: str
    namespace: str = ""
    name: str


class ReleaseReadinessResponse(StrictModel):
    ready: bool
    mode: str
    summary: str
    checks: list[JsonMap] = Field(default_factory=list)
    impact: JsonMap = Field(default_factory=dict)
    next_actions: list[JsonMap] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ReleaseRunResponse(StrictModel):
    run: JsonMap


class ReleaseRunAlertResponse(StrictModel):
    accepted: bool
    event: JsonMap | None = None
    run: JsonMap


class ReleaseRunHandoffResponse(StrictModel):
    handoff: JsonMap


class ReleaseRunReportResponse(StrictModel):
    report: JsonMap


class ReleaseRunListResponse(StrictModel):
    runs: list[JsonMap]


class ReleaseRunSummaryResponse(StrictModel):
    total_runs: int
    status_breakdown: dict[str, int] = Field(default_factory=dict)
    plan_breakdown: dict[str, int] = Field(default_factory=dict)
    active_runs: int = 0
    succeeded_runs: int = 0
    cancelled_runs: int = 0
    attention_required_runs: int = 0
    failed_runs: int = 0
    paused_runs: int = 0
    rollback_requested_runs: int = 0
    waiting_for_approval_runs: int = 0
    live_runs: int = 0
    unhealthy_runs: int = 0
    verification_failed_runs: int = 0
    verification_pending_timeout_runs: int = 0
    policy_override_runs: int = 0
    policy_override_breakdown: dict[str, int] = Field(default_factory=dict)
    active_change_freeze_runs: int = 0
    change_freeze_override_runs: int = 0
    stale_runs: int = 0
    last_run_status: str | None = None
    recent_runs: list[JsonMap] = Field(default_factory=list)


class ReleaseAuditListResponse(StrictModel):
    events: list[JsonMap] = Field(default_factory=list)


class ReleasePlanDispatchResponse(StrictModel):
    accepted: bool
    wave: int
    events: list[JsonMap]
    blockers: list[str] = Field(default_factory=list)
    run: JsonMap | None = None


class DiagnosticItem(StrictModel):
    source: str
    severity: str
    message: str
    code: str
    line: int = 1
    column: int = 1
    end_line: int = 1
    end_column: int = 2
    path: str | None = None
    action: str | None = None


class DiagnosticsResponse(StrictModel):
    diagnostics: list[DiagnosticItem]


class ReleaseManifestRenderResponse(StrictModel):
    manifest: str
    files: list[GeneratedManifestFile] = Field(default_factory=list)
    resources: list[GeneratedManifestResource] = Field(default_factory=list)
    resource_count: int = 0
    diagnostics: list[DiagnosticItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    summary: str = ""


class ReleaseManifestSafePrResponse(ReleaseManifestRenderResponse):
    accepted: bool
    event_id: str
    correlation_id: str
    workflow_run_id: str = ""
    application_id: str = ""
    repo_ref: str = ""
    base_branch: str = ""
    manifest_path: str = ""
    commit_sha: str = ""
    patch_sha256: str = ""


class CatalogItemListResponse(StrictModel):
    items: list[JsonMap]


class CatalogItemResponse(StrictModel):
    item: JsonMap


class CatalogInstallAcceptedResponse(StrictModel):
    accepted: bool
    command_id: str
    correlation_id: str
    status: str


class ProviderCatalogResponse(StrictModel):
    providers: dict[str, list[JsonMap]]


class ClusterImportCandidate(StrictModel):
    cluster_id: str
    name: str
    source: str
    cloud_provider: str
    deploy_provider: str
    kube_context: str | None = None
    external_handle: str | None = None
    console_url: str | None = None
    direct_apply_available: bool = False
    labels: JsonMap = Field(default_factory=dict)


class ClusterRegistrationFlow(StrictModel):
    cloud_provider: str
    label: str
    status: str
    description: str
    deploy_providers: list[JsonMap] = Field(default_factory=list)
    default_deploy_provider: str
    supports_import: bool = False
    unavailable_reason: str | None = None
    import_candidates: list[ClusterImportCandidate] = Field(default_factory=list)


class ProviderClusterDiscoveryResponse(StrictModel):
    default_cloud_provider: str = "existing-k8s"
    default_deploy_provider: str = "manual-manifest"
    flows: list[ClusterRegistrationFlow] = Field(default_factory=list)
    import_candidates: list[ClusterImportCandidate] = Field(default_factory=list)


class ProviderValidationResponse(StrictModel):
    valid: bool
    errors: list[str]
    warnings: list[str]
    selected: dict[str, JsonMap]


class TargetPreflightResponse(StrictModel):
    valid: bool
    duplicate_cluster_id: bool
    provider_ready: bool
    agent_install_status: str
    connection_status: str
    kube_context_allowed: bool | None = None
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    selected: dict[str, JsonMap] = Field(default_factory=dict)
    last_agent_id: str | None = None
    last_seen_at: str | None = None
    management_access: ManagementAccessResponse | None = None
