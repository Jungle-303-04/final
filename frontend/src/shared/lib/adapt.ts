// 실백엔드 응답 형태 → 프론트 타입 정규화. mock 은 이미 프론트 형태라 통과.
// 백엔드가 필드를 덜 주면 안전한 기본값으로 채움(프론트 렌더 크래시 방지).
import type { Application, Cluster, Conversation, Incident, IncidentDetail, RunStep, WorkflowRun } from '@/shared/lib/types';

export function adaptCluster(raw: Record<string, unknown>): Cluster {
  return {
    cluster_id: String(raw.cluster_id ?? ''),
    name: String(raw.name ?? raw.cluster_id ?? ''),
    environment: String(raw.environment ?? 'unknown'),
    connection_status: (raw.connection_status as Cluster['connection_status']) ?? 'unknown',
    node_count: Number(raw.node_count ?? 0),
    pod_count: Number(raw.pod_count ?? 0),
    incident_count: Number(raw.incident_count ?? 0),
    registered_at: String(raw.registered_at ?? raw.created_at ?? new Date().toISOString()),
  };
}

export function adaptApplication(raw: Record<string, unknown>): Application {
  return {
    application_id: String(raw.application_id ?? ''),
    name: String(raw.name ?? raw.application_id ?? ''),
    repo_ref: String(raw.repo_ref ?? ''),
    branch: String(raw.branch ?? 'main'),
    cluster_id: String(raw.cluster_id ?? ''),
    manifest_path: String(raw.manifest_path ?? ''),
    last_run_status: raw.last_run_status as string | undefined,
    last_deployed_at: raw.last_deployed_at as string | undefined,
  };
}

export function adaptRun(raw: Record<string, unknown>): WorkflowRun {
  // 실백엔드: workflow_run_id / created_at / 소문자 status → 프론트 계약으로 정규화.
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
  return {
    run_id: String(raw.run_id ?? raw.workflow_run_id ?? ''),
    application_id: String(raw.application_id ?? ''),
    commit_sha: String(raw.commit_sha ?? ''),
    status: String(raw.status ?? 'unknown').toUpperCase(),
    current_step: String(raw.current_step ?? ''),
    started_at: String(raw.started_at ?? raw.created_at ?? ''),
    steps: Array.isArray(raw.steps) ? (raw.steps as RunStep[]) : [],
    approval_id: (raw.approval_id ?? metadata.approval_id) as string | undefined,
    safe_pr: raw.safe_pr as WorkflowRun['safe_pr'],
  };
}

export function adaptIncident(raw: Record<string, unknown>): Incident {
  // RCA timeline item → 알림/오버뷰 공용 인시던트 표현.
  const rootCause = String(raw.root_cause ?? '');
  const summary =
    (rootCause && rootCause !== 'unknown' ? rootCause : '') ||
    String(raw.error_reason ?? '') ||
    String(raw.current_subject ?? '인시던트');
  return {
    incident_id: String(raw.incident_id ?? raw.correlation_id ?? ''),
    cluster_id: String(raw.cluster_id ?? ''),
    summary,
    stage: String(raw.current_subject ?? raw.status ?? ''),
    at: String(raw.at ?? raw.updated_at ?? ''),
  };
}

export function adaptIncidentDetail(raw: Record<string, unknown>): IncidentDetail {
  // RCA incident 상세(RcaTimelineItem) → 파이프라인 그래프 표현. 필드 누락은 안전 기본값으로 방어.
  const str = (v: unknown) => (v == null || v === '' ? null : String(v));
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const base = adaptIncident(raw);
  return {
    incident_id: base.incident_id,
    cluster_id: base.cluster_id,
    status: String(raw.status ?? raw.stage ?? 'open'),
    current_subject: base.stage,
    summary: base.summary,
    root_cause: str(raw.root_cause),
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
    supporting_evidence: list(raw.supporting_evidence),
    missing_evidence: list(raw.missing_evidence),
    action_route: str(raw.action_route),
    command_id: str(raw.command_id),
    pr_url: str(raw.pr_url),
    error_reason: str(raw.error_reason),
    updated_at: base.at,
  };
}

export function adaptConversationSummary(raw: Record<string, unknown>): Omit<Conversation, 'messages'> {
  return {
    conversation_id: String(raw.conversation_id ?? ''),
    title: String(raw.title ?? '대화'),
    status: (raw.status === 'waiting' ? 'waiting' : 'idle'),
    updated_at: String(raw.updated_at ?? new Date().toISOString()),
  };
}
