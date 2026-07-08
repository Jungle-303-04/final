// 실백엔드 응답 형태 → 프론트 타입 정규화.
// 백엔드가 필드를 덜 주면 안전한 기본값으로 채움(프론트 렌더 크래시 방지).
import type { Application, Cluster, ClusterSummary, Conversation, Deployment, Incident, IncidentDetail, InventoryResource, InventoryResourceDetail, K8sEvent, RunStep, ServiceInfo, Workload, WorkloadResource, WorkflowRun } from '@/shared/lib/types';

export function adaptCluster(raw: Record<string, unknown>): Cluster {
  const settings = (raw.settings ?? {}) as Record<string, unknown>;
  return {
    cluster_id: String(raw.cluster_id ?? ''),
    name: String(raw.name ?? raw.cluster_id ?? ''),
    environment: String(raw.environment ?? 'unknown'),
    role: String(raw.role ?? raw.cluster_role ?? settings.cluster_role ?? 'target'),
    connection_status: (raw.connection_status as Cluster['connection_status']) ?? 'unknown',
    node_count: Number(raw.node_count ?? 0),
    pod_count: Number(raw.pod_count ?? 0),
    incident_count: Number(raw.incident_count ?? 0),
    registered_at: String(raw.registered_at ?? raw.created_at ?? ''),
  };
}

export type RawInventoryResource = {
  resource_type?: string;
  kind?: string;
  namespace?: string | null;
  name?: string;
  uid?: string | null;
  status?: string;
  health?: string;
  labels?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  raw?: unknown;
  observed_at?: string;
  created_at?: string;
};

export function adaptInventorySummary(raw: Record<string, unknown>): ClusterSummary {
  const latest = (raw.latest_snapshot ?? {}) as Record<string, unknown>;
  const snapshotSummary = (latest.summary ?? {}) as Record<string, unknown>;
  const summary = ((snapshotSummary.summary ?? snapshotSummary) ?? {}) as Record<string, unknown>;
  return {
    cluster_id: String(raw.cluster_id ?? ''),
    namespaces: asStringList(summary.namespaces),
    nodes: Array.isArray(summary.nodes) ? summary.nodes.map(adaptNodeSummary) : [],
    pod_phases: asCountMap(summary.pod_phases),
    services: Number(summary.services ?? 0),
  };
}

export function adaptPodResource(raw: RawInventoryResource): Workload {
  const summary = raw.summary ?? {};
  const containers = Array.isArray(summary.containers) ? summary.containers as Record<string, unknown>[] : [];
  const image = String(summary.image ?? containers.find(c => c.image)?.image ?? '');
  const workloadName = String(summary.owner_name ?? raw.name ?? '');
  return {
    name: String(raw.name ?? ''),
    kind: String(summary.owner_kind ?? raw.kind ?? 'Pod'),
    namespace: String(raw.namespace ?? ''),
    ready: String(summary.ready ?? raw.status ?? ''),
    restarts: Number(summary.restart_total ?? 0),
    image,
    node: typeof summary.node_name === 'string' ? summary.node_name : undefined,
    phase: String(raw.status ?? summary.phase ?? 'Unknown'),
    workload_name: workloadName,
    hot: raw.health === 'degraded',
  };
}

export function adaptWorkloadResource(raw: RawInventoryResource): WorkloadResource {
  const summary = raw.summary ?? {};
  const containers = Array.isArray(summary.containers) ? summary.containers as Record<string, unknown>[] : [];
  const image = String(summary.image ?? containers.find(c => c.image)?.image ?? '');
  const desired = Number(summary.desired_replicas ?? 0);
  const ready = Number(summary.ready_replicas ?? 0);
  return {
    name: String(raw.name ?? ''),
    kind: String(raw.kind ?? summary.kind ?? 'Workload'),
    namespace: String(raw.namespace ?? ''),
    status: String(raw.status ?? `${ready}/${desired}`),
    health: String(raw.health ?? 'unknown'),
    desired,
    ready,
    available: Number(summary.available_replicas ?? ready),
    updated: Number(summary.updated_replicas ?? ready),
    image,
    hot: raw.health === 'degraded',
    summary,
  };
}

export function adaptServiceResource(raw: RawInventoryResource): ServiceInfo {
  const summary = raw.summary ?? {};
  const ports = Array.isArray(summary.ports)
    ? summary.ports.map(p => {
      const port = p as Record<string, unknown>;
      return `${port.port ?? ''}${port.protocol ? `/${port.protocol}` : ''}`;
    }).filter(Boolean).join(', ')
    : '';
  return {
    name: String(raw.name ?? ''),
    namespace: String(raw.namespace ?? ''),
    type: String(summary.type ?? raw.status ?? ''),
    cluster_ip: String(summary.cluster_ip ?? ''),
    ports,
    selector: asStringRecord(summary.selector),
  };
}

export function adaptK8sEventResource(raw: RawInventoryResource): K8sEvent {
  const summary = raw.summary ?? {};
  return {
    at: String(summary.last_timestamp ?? summary.first_timestamp ?? raw.observed_at ?? raw.created_at ?? ''),
    type: String(summary.type ?? raw.status ?? 'Normal'),
    reason: String(summary.reason ?? ''),
    target: `${summary.involved_kind ?? 'Object'}/${summary.involved_name ?? raw.name ?? ''}`,
    message: String(summary.message ?? ''),
  };
}

export function adaptInventoryResource(raw: RawInventoryResource): InventoryResource {
  const labels = raw.labels && typeof raw.labels === 'object'
    ? Object.fromEntries(Object.entries(raw.labels).map(([key, value]) => [key, String(value)]))
    : {};
  return {
    resource_type: String(raw.resource_type ?? ''),
    kind: String(raw.kind ?? ''),
    namespace: raw.namespace ?? null,
    name: String(raw.name ?? ''),
    uid: raw.uid ?? null,
    status: String(raw.status ?? raw.health ?? 'unknown'),
    health: String(raw.health ?? 'unknown'),
    age: String(raw.observed_at ?? raw.created_at ?? ''),
    labels,
    summary: raw.summary ?? {},
  };
}

export function adaptInventoryResourceDetail(raw: Record<string, unknown>): InventoryResourceDetail {
  const relatedRaw = (raw.related ?? {}) as Record<string, unknown>;
  const related = Object.fromEntries(
    Object.entries(relatedRaw).map(([group, items]) => [
      group,
      Array.isArray(items) ? (items as RawInventoryResource[]).map(adaptInventoryResource) : [],
    ]),
  );
  const relatedPods = Array.isArray(relatedRaw.pods)
    ? (relatedRaw.pods as RawInventoryResource[]).map(adaptPodResource)
    : [];
  return {
    cluster_id: String(raw.cluster_id ?? ''),
    identity: ((raw.identity ?? {}) as Record<string, unknown>),
    resource: adaptInventoryResource((raw.resource ?? {}) as RawInventoryResource),
    related,
    related_pods: relatedPods,
    events: Array.isArray(raw.events) ? (raw.events as RawInventoryResource[]).map(adaptK8sEventResource) : [],
  };
}

function adaptNodeSummary(raw: unknown): ClusterSummary['nodes'][number] {
  const node = (raw ?? {}) as Record<string, unknown>;
  return {
    name: String(node.name ?? ''),
    ready: Boolean(node.ready),
    pod_count: Number(node.pod_count ?? 0),
    version: String(node.version ?? ''),
    cpu_ratio: typeof node.cpu_ratio === 'number' ? node.cpu_ratio : undefined,
    mem_ratio: typeof node.mem_ratio === 'number' ? node.mem_ratio : undefined,
  };
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asCountMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, Number(count)]));
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const labels = raw.matchLabels && typeof raw.matchLabels === 'object' && !Array.isArray(raw.matchLabels)
    ? raw.matchLabels as Record<string, unknown>
    : raw;
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([key, item]) => key && item != null && item !== '')
      .map(([key, item]) => [key, String(item)]),
  );
}

export function adaptApplication(raw: Record<string, unknown>): Application {
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
  return {
    application_id: String(raw.application_id ?? ''),
    name: String(raw.name ?? raw.application_id ?? ''),
    repo_ref: String(raw.repo_ref ?? metadata.repo_ref ?? ''),
    branch: String(raw.branch ?? raw.default_branch ?? metadata.branch ?? 'main'),
    cluster_id: String(raw.cluster_id ?? ''),
    manifest_path: String(raw.manifest_path ?? ''),
    last_run_status: raw.last_run_status as string | undefined,
    last_deployed_at: raw.last_deployed_at as string | undefined,
  };
}

export function adaptDeployment(raw: Record<string, unknown>): Deployment {
  return {
    application_id: raw.application_id ? String(raw.application_id) : undefined,
    cluster_id: String(raw.cluster_id ?? ''),
    namespace: String(raw.namespace ?? 'unknown'),
    name: String(raw.name ?? raw.app_name ?? ''),
    image: String(raw.image ?? ''),
    replicas: Number(raw.replicas ?? 0),
    status: String(raw.status ?? 'unknown'),
    manifest_path: raw.manifest_path ? String(raw.manifest_path) : undefined,
    branch: raw.branch ? String(raw.branch) : undefined,
    repo_ref: raw.repo_ref ? String(raw.repo_ref) : undefined,
  };
}

// 실백엔드 step 이름(git/render/diff/...) → 콘솔 파이프라인 표기.
const STEP_NAME_MAP: Record<string, string> = {
  git: 'STARTED',
  render: 'RENDERING',
  diff: 'DIFFING',
  policy: 'POLICY_CHECKING',
  approval: 'WAITING_FOR_APPROVAL',
  safe_pr: 'WAITING_FOR_APPROVAL',
  apply: 'APPLYING',
  health: 'ROLLOUT_WAITING',
};

function adaptRunStep(raw: Record<string, unknown>): RunStep {
  // 이미 프론트 형태({name:'DIFFING', detail})면 그대로 통과.
  if (typeof raw.detail === 'string' || raw.message === undefined && raw.details === undefined) {
    return raw as unknown as RunStep;
  }
  const details = (raw.details ?? {}) as Record<string, unknown>;
  const changes = Array.isArray(details.changes) ? (details.changes as RunStep['changes']) : undefined;
  const resource = typeof details.resource === 'string'
    ? `${details.resource}${details.namespace ? ` · ${details.namespace}` : ''}`
    : undefined;
  return {
    name: STEP_NAME_MAP[String(raw.name ?? '')] ?? String(raw.name ?? '').toUpperCase(),
    status: String(raw.status ?? 'pending').toUpperCase(),
    detail: typeof raw.message === 'string' && raw.message ? raw.message : undefined,
    resource,
    changes,
  };
}

export function adaptRun(raw: Record<string, unknown>): WorkflowRun {
  // 실백엔드: workflow_run_id / created_at / 소문자 status → 프론트 계약으로 정규화.
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
  const approval = recordValue(raw.approval) ?? firstOpenApproval(raw.approvals);
  return {
    run_id: String(raw.run_id ?? raw.workflow_run_id ?? ''),
    application_id: String(raw.application_id ?? ''),
    commit_sha: String(raw.commit_sha ?? ''),
    status: String(raw.status ?? 'unknown').toUpperCase(),
    current_step: String(raw.current_step ?? ''),
    started_at: String(raw.started_at ?? raw.created_at ?? ''),
    steps: Array.isArray(raw.steps) ? (raw.steps as Record<string, unknown>[]).map(adaptRunStep) : [],
    approval_id: (raw.approval_id ?? metadata.approval_id ?? approval?.approval_id) as string | undefined,
    safe_pr: raw.safe_pr as WorkflowRun['safe_pr'],
  };
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function firstOpenApproval(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map(recordValue)
    .find(item => {
      const status = String(item?.status ?? '').toLowerCase();
      return item && (!status || status === 'requested' || status === 'not_required');
    });
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
    correlation_id: String(raw.correlation_id ?? raw.incident_id ?? ''),
    cluster_id: String(raw.cluster_id ?? ''),
    summary,
    stage: String(raw.current_subject ?? raw.status ?? ''),
    at: String(raw.at ?? raw.updated_at ?? ''),
  };
}

export function isIncidentTimelineItem(raw: Record<string, unknown>): boolean {
  if (raw.incident_id) return true;
  if (raw.root_cause || raw.action_route || raw.command_id || raw.pr_url || raw.error_reason) return true;
  const subject = String(raw.current_subject ?? raw.status ?? '').toLowerCase();
  if (subject.startsWith('evidence.')) return false;
  return /incident|rca|recovery|command|safe_pr/.test(subject);
}

export function adaptIncidentDetail(raw: Record<string, unknown>): IncidentDetail {
  // RCA incident 상세(RcaTimelineItem) → 파이프라인 그래프 표현. 필드 누락은 안전 기본값으로 방어.
  const str = (v: unknown) => (v == null || v === '' ? null : String(v));
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const base = adaptIncident(raw);
  return {
    incident_id: base.incident_id,
    correlation_id: base.correlation_id,
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
    namespace: str(raw.incident_namespace ?? raw.namespace),
    resource_kind: str(raw.incident_resource_kind ?? raw.resource_kind),
    resource_name: str(raw.incident_resource_name ?? raw.resource_name),
    symptom: str(raw.incident_symptom ?? raw.symptom),
  };
}

export function adaptConversationSummary(raw: Record<string, unknown>): Omit<Conversation, 'messages'> {
  return {
    conversation_id: String(raw.conversation_id ?? ''),
    title: String(raw.title ?? '대화'),
    status: (raw.status === 'waiting' ? 'waiting' : 'idle'),
    updated_at: String(raw.updated_at ?? ''),
  };
}
