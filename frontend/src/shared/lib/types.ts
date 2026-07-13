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
export interface GitOpsPoll { status: string; status_code?: number; error_kind?: string; error?: string; last_seen_commit_sha?: string; last_polled_at?: string }
export interface Deployment { cluster_id: string; namespace: string; name: string; image: string; replicas: number; status: string; application_id?: string; manifest_path?: string; branch?: string; repo_ref?: string; gitops_poll?: GitOpsPoll }

// release flow
export interface ReleasePlanStep { step_id?: string; application_id: string; name: string; position: number; depends_on: string[]; config: Record<string, unknown> }
export interface ReleasePlan { plan_id?: string; name: string; description: string; status: 'draft'|'active'|'paused'|'archived'; settings: Record<string, unknown>; steps: ReleasePlanStep[]; updated_at?: string }
export interface ReleasePreviewStep { step_id: string; application_id: string; name: string; position: number; wave: number | null; blocked_by: string[]; gate: string; strategy: string; environment: string; action: string }
export interface ReleasePreviewWave { wave: number; step_ids: string[]; applications: string[] }
export interface ReleasePlanPreview { plan_id?: string; executable: boolean; summary: string; waves: ReleasePreviewWave[]; steps: ReleasePreviewStep[]; blockers: string[] }
export interface ReleaseReadinessCheck { check_id: string; name: string; status: 'passed'|'warning'|'blocked'|'info'|string; message: string; blockers: string[] }
export interface ReleaseReadinessAction { action_id: string; check_id: string; label: string; severity: 'warning'|'blocked'|string; message: string; blockers: string[] }
export interface ReleaseReadinessImpactStep { step_id: string; application_id: string; name: string; environment: string; action: string; strategy: string; wave: number | null }
export interface ReleaseReadinessImpact { summary: string; runtime_mode: string; live_side_effects: boolean; total_steps: number; total_waves: number; first_wave: number; applications: string[]; environments: string[]; production_targets: string[]; production_target_count: number; first_wave_steps: ReleaseReadinessImpactStep[] }
export interface ReleaseReadiness { ready: boolean; mode: string; summary: string; checks: ReleaseReadinessCheck[]; impact?: ReleaseReadinessImpact; next_actions: ReleaseReadinessAction[]; blockers: string[]; warnings: string[] }
export interface ReleaseRunStep { run_step_id: string; application_id: string; name: string; wave: number; status: string; workflow_run_id?: string; event_id?: string; correlation_id?: string; approval_id?: string | null; health: Record<string, unknown>; rollback: Record<string, unknown>; details: Record<string, unknown>; workflow?: Record<string, unknown> }
export interface ReleaseRunEvent { audit_id: string; event_type: string; message: string; actor?: string; details: Record<string, unknown>; created_at?: string }
export interface ReleaseAuditEvent extends ReleaseRunEvent { run_id: string; plan_id: string; plan_name: string; run_status: string; application_ids: string[] }
export interface ReleaseRun { run_id: string; plan_id: string; plan_name: string; status: string; derived_status?: string; current_wave: number; total_waves: number; started_by?: string; settings: Record<string, unknown>; github: Record<string, unknown>; rollback: Record<string, unknown>; health: Record<string, unknown>; attention?: Record<string, unknown>; steps: ReleaseRunStep[]; events: ReleaseRunEvent[]; created_at?: string; updated_at?: string }
export interface ReleaseRunHandoffAction { action: string; label: string; enabled: boolean; reason?: string }
export interface ReleaseRunHandoffCheck { name: string; status: 'passed'|'warning'|'blocked'|'info'|string; message: string }
export interface ReleaseRunHandoffVerificationJob { job_id: string; application_id: string; kind: string; status: string; target: Record<string, unknown>; result?: Record<string, unknown>; error?: string; queued_at?: string; timeout_minutes?: number; age_minutes?: number; step_name?: string }
export interface ReleaseRunHandoffVerification { status: 'passed'|'warning'|'blocked'|'info'|string; message: string; evidence: string[]; jobs?: ReleaseRunHandoffVerificationJob[]; timed_out_jobs?: ReleaseRunHandoffVerificationJob[]; job_count?: number; override_reason?: string | null; production_targets: string[] }
export interface ReleaseRunHandoffAbortCriteria { status: 'passed'|'warning'|'blocked'|'info'|string; message: string; criteria: string[]; override_reason?: string | null; production_targets: string[] }
export interface ReleaseRunHandoffChangeFreeze { status: 'passed'|'warning'|'blocked'|'info'|string; message: string; active: boolean; start?: string | null; end?: string | null; override_reason?: string | null; production_targets: string[] }
export interface ReleaseRunPolicyOverride { source: string; reason: string; production_targets: string[] }
export interface ReleaseRunHandoff { run_id: string; plan_id: string; plan_name: string; status: string; headline: string; severity: string; current_wave: number; total_waves: number; live_side_effects: boolean; attention_reasons: string[]; verification?: ReleaseRunHandoffVerification; abort_criteria?: ReleaseRunHandoffAbortCriteria; change_freeze?: ReleaseRunHandoffChangeFreeze; policy_overrides: ReleaseRunPolicyOverride[]; next_actions: ReleaseRunHandoffAction[]; checks: ReleaseRunHandoffCheck[]; last_event?: Record<string, unknown> | null }
export interface ReleaseRunReport { run_id: string; plan_id: string; plan_name: string; status: string; current_wave: number; total_waves: number; generated_at: string; handoff: ReleaseRunHandoff; audit_events: ReleaseAuditEvent[]; markdown: string }
export interface ReleaseRunSummary { total_runs: number; status_breakdown: Record<string, number>; plan_breakdown: Record<string, number>; active_runs: number; succeeded_runs: number; cancelled_runs: number; attention_required_runs: number; failed_runs: number; paused_runs: number; rollback_requested_runs: number; waiting_for_approval_runs: number; live_runs: number; unhealthy_runs: number; verification_failed_runs: number; verification_pending_timeout_runs: number; policy_override_runs: number; policy_override_breakdown: Record<string, number>; active_change_freeze_runs: number; change_freeze_override_runs: number; stale_runs: number; last_run_status?: string | null; recent_runs: { run_id: string; plan_id: string; status: string; attention_reasons?: string[] }[] }
export interface ReleasePlanDispatch { accepted: boolean; wave: number; events: { event_id: string; correlation_id: string; event: Record<string, unknown> }[]; blockers?: string[]; run?: ReleaseRun | null }
export interface Diagnostic { source: string; severity: 'error'|'warning'|'info'; message: string; code: string; line: number; column: number; end_line: number; end_column: number; path?: string; action?: string | null }
export interface GeneratedManifestFile { path: string; content: string; action: string; description: string }
export interface GeneratedManifestResource { api_version: string; kind: string; namespace: string; name: string }
export interface ReleaseGeneratedManifest { manifest: string; files: GeneratedManifestFile[]; resources: GeneratedManifestResource[]; resource_count: number; diagnostics: Diagnostic[]; warnings: string[]; summary: string }
export interface ReleaseManifestSafePr extends ReleaseGeneratedManifest { accepted: boolean; event_id: string; correlation_id: string; workflow_run_id: string; application_id: string; repo_ref: string; base_branch: string; manifest_path: string; commit_sha: string; patch_sha256: string }

export interface ConversationSummary { conversation_id: string; title: string; status: 'idle'|'waiting'; updated_at: string }
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
export interface Conversation extends ConversationSummary { messages: ChatMessage[] }
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
  action_route: string | null; command_id: string | null; pr_url: string | null; error_reason: string | null; updated_at: string;
  namespace: string | null; resource_kind: string | null; resource_name: string | null; symptom: string | null }
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
