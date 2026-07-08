// 백엔드 계약 수기 타입 — 초기 구현용. 백엔드 연동 시 openapi 코드젠으로 전환(07-build-plan S2 주석)
export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export interface Session { authenticated: boolean; user_id: string; email?: string; workspace_id: string; roles: string[] }
export interface Cluster { cluster_id: string; name: string; environment: string; role: 'target'|'management'|string; connection_status: 'online'|'stale'|'never_connected'|'pending_install'|'install_expired'|'connected'|'disconnected'|'unknown'; node_count: number; pod_count: number; incident_count: number; registered_at: string }
export interface ClusterSummary { cluster_id: string; namespaces: string[]; nodes: NodeInfo[]; pod_phases: Record<string, number>; services: number }
export interface NodeInfo { name: string; ready: boolean; pod_count: number; version: string; cpu_ratio?: number; mem_ratio?: number }
export interface Workload { name: string; kind: string; namespace: string; ready: string; restarts: number; image: string; node?: string; phase: string; hot?: boolean; workload_name?: string }
export interface WorkloadResource { name: string; kind: string; namespace: string; status: string; health: string; desired: number; ready: number; available: number; updated: number; image: string; hot?: boolean; summary: Record<string, unknown> }
export interface InventoryResource { resource_type: string; kind: string; namespace: string | null; name: string; uid?: string | null; status: string; health: string; age: string; labels: Record<string, string>; summary: Record<string, unknown> }
export interface InventoryResourceDetail { cluster_id: string; identity: Record<string, unknown>; resource: InventoryResource; related: Record<string, InventoryResource[]>; related_pods: Workload[]; events: K8sEvent[] }
export interface ServiceInfo { name: string; namespace: string; type: string; cluster_ip: string; ports: string; selector: Record<string, string> }
export interface K8sEvent { at: string; type: string; reason: string; target: string; message: string }
export interface Application { application_id: string; name: string; repo_ref: string; branch: string; cluster_id: string; manifest_path: string; last_run_status?: string; last_deployed_at?: string }
export interface WorkflowRun { run_id: string; application_id: string; commit_sha: string; status: string; current_step: string; started_at: string; steps: RunStep[]; approval_id?: string; safe_pr?: SafePr }
export interface RunStep { name: string; status: string; detail?: string; resource?: string; changes?: PlanChange[] }
// terraform plan 스타일 필드 변경 — diff-worker 의 3-way 비교(old_desired/live/new_desired) 산출물
export interface PlanChange {
  field_path: string;
  classification: 'intended_change' | 'adoption_required' | 'drift' | 'conflict_or_manual_change' | 'already_converged' | string;
  before?: unknown;
  after?: unknown;
}
export interface SafePr { status: string; pr_url?: string; explanation?: string; diff_before?: string; diff_after?: string; error?: string }
export interface Deployment { cluster_id: string; namespace: string; name: string; image: string; replicas: number; status: string; application_id?: string; manifest_path?: string; branch?: string; repo_ref?: string }
export interface ConversationSummary { conversation_id: string; title: string; status: 'idle'|'waiting'; updated_at: string }
export interface Conversation extends ConversationSummary { messages: ChatMessage[] }
export interface ChatToolCall { name: string; args: string; status: Tone }
export interface ChatActionOption { action_id: string; label: string; risk: Tone; impact: string }
export interface ChatActions { plan_id: string; options: ChatActionOption[]; selected?: string }
export interface ChatApprovalRef { approval_id: string; summary: string; resolved?: 'granted'|'rejected' }
export interface ChatToolTrace { tool?: string; name?: string; arguments?: unknown; args?: unknown; ok?: boolean; error?: string; result?: unknown }
export interface ChatMessageMetadata {
  tool_trace?: ChatToolTrace[];
  tool_calls?: ChatToolCall[];
  actions?: ChatActions;
  approval_ref?: ChatApprovalRef;
  [key: string]: unknown;
}
export interface ChatMessage { message_id: string; role: 'user'|'assistant'; status?: string; content: string; created_at: string;
  metadata?: ChatMessageMetadata;
  tool_calls?: ChatToolCall[];
  actions?: ChatActions;
  approval_ref?: ChatApprovalRef }
export interface AiConversationDetailResponse { conversation: Record<string, unknown>; messages: Record<string, unknown>[] }
export interface AiConversationAcceptedResponse { accepted: boolean; conversation_id: string; message_id: string; event_id: string; correlation_id: string }
export interface Incident { incident_id: string; correlation_id: string; cluster_id: string; summary: string; stage: string; at: string }
export interface DeadLetter { id: number; original_subject: string; consumer: string; error: string; status: string; created_at: string }
export interface MetricQueryPreset {
  preset_id: string; workspace_id: string; cluster_id: string; name: string; description: string;
  source: string; query: string; range_seconds: number | null; step_seconds: number | null;
  unit: string; metadata: Record<string, unknown>; created_by: string; created_at: string | null; updated_at: string | null
}
export interface MetricWidget {
  widget_id: string; workspace_id: string; cluster_id: string; query_preset_id: string; title: string; kind: string;
  position: Record<string, unknown>; settings: Record<string, unknown>; created_by: string; created_at: string | null; updated_at: string | null
}
export interface Org { org_id: string; name: string; description: string; member_count: number; group_count: number; created_at: string }
export interface Group { group_id: string; org_id: string; name: string; member_count: number }
export interface User { user_id: string; email: string; role: string; status: 'active'|'pending_verification'|'pending_approval'; groups: string[]; created_at: string }
export interface AccessGrant { access_id: string; subject_type: 'user'|'group'; subject_label: string; resource_type: string; resource_id: string; role: string; granted_at: string }
export interface Notice { id: string; kind: 'approval'|'incident'|'dlq'|'cluster'; tone: Tone; title: string; at: string; link: string; read: boolean }
export interface IncidentDetail { incident_id: string; correlation_id: string; cluster_id: string; status: string; current_subject: string; summary: string;
  root_cause: string | null; confidence: number | null; supporting_evidence: string[]; missing_evidence: string[];
  action_route: string | null; command_id: string | null; pr_url: string | null; error_reason: string | null; updated_at: string }
// GET /evidence — raw payload 제외 안전 요약 (EvidenceQueryResponse.items[])
export interface EvidenceSourceSummary { source: string; summary: string;
  schema_version?: number | null; collector?: string | null; collector_version?: string | null;
  source_version?: string | null; query_version?: string | null; collected_at?: string | null;
  evidence_key?: string | null; source_id?: string | null; agent_id?: string | null; window_start?: string | null }
export interface EvidenceRecord { id: number; correlation_id: string; kind: string; cluster_id?: string | null;
  evidence_ref?: string | null; summary: string; sources: EvidenceSourceSummary[]; created_at: string | null }
// GET /rca-reports — RCA report 화이트리스트 요약 (RcaReportListResponse.items[])
export interface RcaCandidateScore { candidate_id: string; title: string | null; source: string | null;
  score: number | null; reason: string | null; supporting_evidence: string[]; missing_evidence: string[] }
export interface RcaEvidenceRef { source: string; name: string; check_id: string | null;
  summary: string | null; query: string | null; evidence_ref: string | null;
  schema_version?: number | null; source_version?: string | null; collector?: string | null;
  collector_version?: string | null; query_version?: string | null; collected_at?: string | null;
  evidence_key?: string | null; source_id?: string | null; agent_id?: string | null; window_start?: string | null }
export interface RcaMissingCheck { check_id: string; source: string | null; status: string | null; reason: string | null }
export interface RcaReportSummary { id: number; correlation_id: string; root_cause: string; action: string;
  incident_id: string | null; cluster_id: string | null; symptom: string | null; severity: string | null;
  confidence: number | null; reason: string | null; evidence_ref: string | null;
  supporting_evidence: string[]; missing_evidence: string[]; created_at: string | null;
  // 분석 심화 필드 — 구 버전 백엔드 응답엔 없을 수 있어 optional(배포 순서 무관 동작)
  resource_kind?: string | null; resource_name?: string | null; namespace?: string | null;
  secondary_symptoms?: string[]; selected_candidate_id?: string | null;
  candidates?: RcaCandidateScore[]; supporting_evidence_refs?: RcaEvidenceRef[]; missing_evidence_checks?: RcaMissingCheck[] }
export interface RecoveryActionCandidate {
  action_id: string; title: string; description: string; route: string; rank: number; score: number;
  risk_level: string; blast_radius: string; approval_required: boolean; prerequisites: string[];
  validation_checks: string[]; rollback_plan: string; evidence_refs: string[]
}
export interface RecoveryPlanStatus {
  plan_id: string; correlation_id: string; incident_id: string; evidence_ref: string; status: string;
  summary: string; target: Record<string, unknown>; recommended_action_id: string; execution_route: string;
  selection_required: boolean; selected_action_id: string | null; selected_by: string | null;
  selected_action: RecoveryActionCandidate | null; candidates: RecoveryActionCandidate[]
}
export interface LiveSnapshot { at: string; connected: boolean; cluster_id?: string; namespaces: { namespace: string; pods: { name: string; phase: string; restarts: number; hot: boolean }[] }[]; rollout?: { name: string; progress: number } }
export interface CatalogItem { item_id: string; name: string; description: string; category: string }
