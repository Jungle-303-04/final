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


class InventorySummaryResponse(StrictModel):
    cluster_id: str
    latest_snapshot: JsonMap | None = None
    counts: list[JsonMap] = Field(default_factory=list)


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


class ProviderCatalogResponse(StrictModel):
    providers: dict[str, list[JsonMap]]


class ProviderValidationResponse(StrictModel):
    valid: bool
    errors: list[str]
    warnings: list[str]
    selected: dict[str, JsonMap]
