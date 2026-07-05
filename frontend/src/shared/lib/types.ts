// 백엔드 계약 수기 타입 — 초기 구현용. 백엔드 연동 시 openapi 코드젠으로 전환(07-build-plan S2 주석)
export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export interface Session { authenticated: boolean; user_id: string; email?: string; workspace_id: string; roles: string[] }
export interface Cluster { cluster_id: string; name: string; environment: string; connection_status: 'connected'|'disconnected'|'unknown'; node_count: number; pod_count: number; incident_count: number; registered_at: string }
export interface ClusterSummary { cluster_id: string; namespaces: string[]; nodes: NodeInfo[]; pod_phases: Record<string, number>; services: number }
export interface NodeInfo { name: string; ready: boolean; pod_count: number; version: string; cpu_ratio?: number; mem_ratio?: number }
export interface Workload { name: string; kind: string; namespace: string; ready: string; restarts: number; image: string; node?: string; phase: string; hot?: boolean }
export interface InventoryResource { kind: string; namespace: string | null; name: string; status: string; age: string; raw?: unknown }
export interface ServiceInfo { name: string; namespace: string; type: string; cluster_ip: string; ports: string }
export interface K8sEvent { at: string; type: string; reason: string; target: string; message: string }
export interface Application { application_id: string; name: string; repo_ref: string; branch: string; cluster_id: string; manifest_path: string; last_run_status?: string; last_deployed_at?: string }
export interface WorkflowRun { run_id: string; application_id: string; commit_sha: string; status: string; current_step: string; started_at: string; steps: RunStep[]; approval_id?: string; safe_pr?: SafePr }
export interface RunStep { name: string; status: string; detail?: string }
export interface SafePr { status: string; pr_url?: string; explanation?: string; diff_before?: string; diff_after?: string; error?: string }
export interface Deployment { cluster_id: string; namespace: string; name: string; image: string; replicas: number; status: string }
export interface Conversation { conversation_id: string; title: string; status: 'idle'|'waiting'; updated_at: string; messages: ChatMessage[] }
export interface ChatMessage { message_id: string; role: 'user'|'assistant'; status?: string; content: string; created_at: string;
  tool_calls?: { name: string; args: string; status: Tone }[];
  actions?: { plan_id: string; options: { action_id: string; label: string; risk: Tone; impact: string }[]; selected?: string };
  approval_ref?: { approval_id: string; summary: string; resolved?: 'granted'|'rejected' } }
export interface Incident { incident_id: string; cluster_id: string; summary: string; stage: string; at: string }
export interface DeadLetter { id: number; original_subject: string; consumer: string; error: string; status: string; created_at: string }
export interface Org { org_id: string; name: string; description: string; member_count: number; group_count: number; created_at: string }
export interface Group { group_id: string; org_id: string; name: string; member_count: number }
export interface User { user_id: string; email: string; role: string; status: 'active'|'pending_verification'|'pending_approval'; groups: string[]; created_at: string }
export interface AccessGrant { access_id: string; subject_type: 'user'|'group'; subject_label: string; resource_type: string; resource_id: string; role: string; granted_at: string }
export interface Notice { id: string; kind: 'approval'|'incident'|'dlq'|'cluster'; tone: Tone; title: string; at: string; link: string; read: boolean }
export interface LiveSnapshot { at: string; connected: boolean; namespaces: { namespace: string; pods: { name: string; phase: string; restarts: number; hot: boolean }[] }[]; rollout?: { name: string; progress: number } }
export interface CatalogItem { item_id: string; name: string; description: string; category: string }
