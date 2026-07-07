// 데모/개발용 목데이터 — VITE_API_MODE=mock 에서만 사용 (docs/fd/03 D7 확장: 전 API 데모 모드)
import type {
  AccessGrant, Application, CatalogItem, Cluster, ClusterSummary, Conversation,
  DeadLetter, Deployment, Group, Incident, InventoryResource, K8sEvent, Org,
  ServiceInfo, User, Workload, WorkflowRun,
} from '@/shared/lib/types';

const now = () => new Date().toISOString();
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export const clusters: Cluster[] = [
  { cluster_id: 'target', name: 'target', environment: 'sandbox', connection_status: 'connected', node_count: 3, pod_count: 24, incident_count: 1, registered_at: ago(60 * 24 * 3) },
  { cluster_id: 'cluster-1', name: 'prod-seoul', environment: 'production', connection_status: 'connected', node_count: 6, pod_count: 58, incident_count: 0, registered_at: ago(60 * 24 * 30) },
  { cluster_id: 'cluster-2', name: 'staging', environment: 'staging', connection_status: 'disconnected', node_count: 2, pod_count: 11, incident_count: 0, registered_at: ago(60 * 24 * 10) },
];

const mkPods = (node: string, n: number, ns: string): Workload[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `${ns}-pod-${node.slice(-1)}${i}`, kind: 'Pod', namespace: ns,
    ready: i % 7 === 3 ? '0/1' : '1/1', restarts: i % 7 === 3 ? 6 : i % 3,
    image: 'ghcr.io/example/checkout-api:v1.4.2', node,
    phase: i % 7 === 3 ? 'CrashLoopBackOff' : i % 11 === 5 ? 'Pending' : 'Running',
    hot: i % 7 === 3,
  }));

export const workloadsByCluster: Record<string, Workload[]> = {
  target: [...mkPods('node-1', 9, 'sandbox'), ...mkPods('node-2', 8, 'target'), ...mkPods('node-3', 7, 'kube-system')],
  'cluster-1': [...mkPods('node-1', 20, 'shop'), ...mkPods('node-2', 20, 'payment'), ...mkPods('node-3', 18, 'kube-system')],
  'cluster-2': mkPods('node-1', 11, 'staging'),
};

export function summaryOf(clusterId: string): ClusterSummary {
  const pods = workloadsByCluster[clusterId] ?? [];
  const nodes = [...new Set(pods.map(p => p.node!))].map((name, i) => ({
    name, ready: !(clusterId === 'cluster-2'), pod_count: pods.filter(p => p.node === name).length,
    version: 'v1.31.2', cpu_ratio: 0.35 + i * 0.18, mem_ratio: 0.5 + i * 0.1,
  }));
  const phases: Record<string, number> = {};
  pods.forEach(p => { phases[p.phase] = (phases[p.phase] ?? 0) + 1; });
  return { cluster_id: clusterId, namespaces: [...new Set(pods.map(p => p.namespace))], nodes, pod_phases: phases, services: 6 };
}

export const resources: InventoryResource[] = [
  { kind: 'Deployment', namespace: 'sandbox', name: 'checkout-api', status: 'healthy', age: '3d' },
  { kind: 'Deployment', namespace: 'sandbox', name: 'cart-api', status: 'degraded', age: '3d' },
  { kind: 'ConfigMap', namespace: 'target', name: 'target-runtime-config', status: 'active', age: '3d' },
  { kind: 'Node', namespace: null, name: 'node-1', status: 'ready', age: '30d' },
  { kind: 'Node', namespace: null, name: 'node-2', status: 'ready', age: '30d' },
  { kind: 'Node', namespace: null, name: 'node-3', status: 'ready', age: '12d' },
];
export const services: ServiceInfo[] = [
  { name: 'checkout-api', namespace: 'sandbox', type: 'ClusterIP', cluster_ip: '10.96.11.2', ports: '8080/TCP' },
  { name: 'prometheus', namespace: 'target', type: 'ClusterIP', cluster_ip: '10.96.4.9', ports: '9090/TCP' },
];
export const events: K8sEvent[] = [
  { at: ago(4), type: 'Warning', reason: 'BackOff', target: 'pod/sandbox-pod-13', message: 'Back-off restarting failed container' },
  { at: ago(9), type: 'Normal', reason: 'ScalingReplicaSet', target: 'deployment/checkout-api', message: 'Scaled up replica set to 2' },
];

export const applications: Application[] = [
  { application_id: 'app-checkout', name: 'checkout-api', repo_ref: 'Jungle-303-04/final', branch: 'main', cluster_id: 'target', manifest_path: 'src/samples/smoke/deploy.yaml', last_run_status: 'WAITING_FOR_APPROVAL', last_deployed_at: ago(30) },
  { application_id: 'app-cart', name: 'cart-api', repo_ref: 'Jungle-303-04/cart', branch: 'main', cluster_id: 'target', manifest_path: 'deploy.yaml', last_run_status: 'SUCCEEDED', last_deployed_at: ago(200) },
];

const STEPS = ['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING', 'SUCCEEDED'];
function mkRun(id: string, appId: string, sha: string, status: string, minAgo: number): WorkflowRun {
  const idx = STEPS.indexOf(status);
  return {
    run_id: id, application_id: appId, commit_sha: sha, status, current_step: status, started_at: ago(minAgo),
    steps: STEPS.map((name, i) => ({
      name,
      status: status === 'FAILED' && i === 3 ? 'FAILED' : i < idx ? 'SUCCEEDED' : i === idx ? status : 'PENDING',
      detail: name === 'DIFFING' ? 'image: v1.4.1 → v1.4.2 · replicas: 2' : undefined,
      // 실백엔드 diff-worker 의 3-way plan 산출물과 동형 — 승인 화면 +/~/- 미리보기용
      resource: name === 'DIFFING' ? 'deployment/checkout-api · sandbox' : undefined,
      changes: name === 'DIFFING' ? [
        { field_path: 'image', classification: 'intended_change', before: 'v1.4.1', after: 'v1.4.2' },
        { field_path: 'replicas', classification: 'adoption_required', before: '__missing__', after: 2 },
        { field_path: 'resources.limits.memory', classification: 'drift', before: '256Mi', after: '512Mi' },
        { field_path: 'labels.app', classification: 'already_converged', before: 'checkout-api', after: 'checkout-api' },
      ] : undefined,
    })),
    approval_id: status === 'WAITING_FOR_APPROVAL' ? 'apr-1' : undefined,
    safe_pr: id === 'run-3' ? { status: 'created', pr_url: 'https://github.com/Jungle-303-04/final/pull/42', explanation: 'CrashLoopBackOff 원인인 메모리 상한을 256Mi→512Mi 로 상향', diff_before: 'memory: 256Mi', diff_after: 'memory: 512Mi' } : undefined,
  };
}
export const runsByApp: Record<string, WorkflowRun[]> = {
  'app-checkout': [mkRun('run-1', 'app-checkout', 'a1b2c3d4e5f6', 'WAITING_FOR_APPROVAL', 12), mkRun('run-3', 'app-checkout', '99e8d7c6b5a4', 'SUCCEEDED', 300)],
  'app-cart': [mkRun('run-2', 'app-cart', 'f6e5d4c3b2a1', 'FAILED', 90)],
};
export const deploymentsByApp: Record<string, Deployment[]> = {
  'app-checkout': [{ cluster_id: 'target', namespace: 'sandbox', name: 'checkout-api', image: 'v1.4.2', replicas: 2, status: 'healthy' }],
  'app-cart': [{ cluster_id: 'target', namespace: 'sandbox', name: 'cart-api', image: 'v0.9.1', replicas: 1, status: 'degraded' }],
};

export const conversations: Conversation[] = [{
  conversation_id: 'conv-1', title: 'sandbox CrashLoop 원인 분석', status: 'idle', updated_at: ago(5),
  messages: [
    { message_id: 'm1', role: 'user', content: 'sandbox-pod-13 이 계속 재시작해. 원인 분석해줘', created_at: ago(9) },
    { message_id: 'm2', role: 'assistant', content: '증거를 수집했습니다. **메모리 상한 초과(OOMKilled)** 가 원인입니다.\n\n- 최근 30분 재시작 6회\n- `memory.limit=256Mi`, 피크 사용량 291Mi', created_at: ago(8), tool_calls: [{ name: 'evidence.collect', args: 'cluster=target pod=sandbox-pod-13', status: 'ok' }, { name: 'metrics.query', args: 'container_memory_working_set_bytes', status: 'ok' }] },
    { message_id: 'm3', role: 'assistant', content: '복구 액션을 제안합니다. 실행할 액션을 선택하세요.', created_at: ago(7), actions: { plan_id: 'plan-1', options: [ { action_id: 'act-1', label: 'memory limit 256Mi → 512Mi 상향 (Safe PR)', risk: 'ok', impact: '재배포 1회, 서비스 중단 없음' }, { action_id: 'act-2', label: 'rollout restart deployment/checkout-api', risk: 'warn', impact: '팟 순차 재시작 ~30s' } ] } },
  ],
}];

export const incidents: Incident[] = [
  { incident_id: 'inc-1', correlation_id: 'corr-inc-1', cluster_id: 'target', summary: 'sandbox-pod-13 CrashLoopBackOff', stage: 'recovery.planned', at: ago(15) },
];
// GET /evidence 데모 — EvidenceRecordItem 동형
export const evidenceRecords = [
  { id: 3, workspace_id: 'default', correlation_id: 'corr-inc-1', kind: 'prometheus', created_at: ago(13), payload: { query: 'container_memory_working_set_bytes{pod="sandbox-pod-13"}', point_count: 20, peak: '291Mi' } },
  { id: 2, workspace_id: 'default', correlation_id: 'corr-inc-1', kind: 'loki', created_at: ago(14), payload: { query: '{pod="sandbox-pod-13"} |= "OOM"', lines: 4, sample: 'signal: killed (OOMKilled)' } },
  { id: 1, workspace_id: 'default', correlation_id: 'corr-inc-1', kind: 'kubernetes', created_at: ago(15), payload: { reason: 'BackOff', restart_count: 6, last_state: 'OOMKilled' } },
];
// GET /rca-reports 데모 — RcaReportSummaryItem 동형
export const rcaReports = [
  { id: 1, workspace_id: 'default', correlation_id: 'corr-inc-1', incident_id: 'inc-1', cluster_id: 'target',
    root_cause: 'memory limit 256Mi 대비 피크 사용량 291Mi — OOMKilled 반복', action: 'safe_pr',
    symptom: 'sandbox-pod-13 CrashLoopBackOff', severity: 'high', confidence: 0.86,
    reason: '메모리 사용 곡선과 OOMKilled 로그가 일치', evidence_ref: 'evidence/corr-inc-1',
    supporting_evidence: ['restart_count=6 (30m)', 'container_memory_working_set peak 291Mi', 'loki: OOMKilled x4'],
    missing_evidence: ['tempo trace'], created_at: ago(12) },
];
export const deadLetters: DeadLetter[] = [
  { id: 1, original_subject: 'manifest.rendered', consumer: 'diff-worker', error: 'render timeout', status: 'open', created_at: ago(120) },
];
export const orgs: Org[] = [
  { org_id: 'org-1', name: 'Platform', description: '플랫폼 운영 조직', member_count: 3, group_count: 2, created_at: ago(60 * 24 * 20) },
];
export const groups: Group[] = [
  { group_id: 'grp-1', org_id: 'org-1', name: 'sre', member_count: 2 },
  { group_id: 'grp-2', org_id: 'org-1', name: 'dev', member_count: 1 },
];
export const users: User[] = [
  { user_id: 'u-1', email: 'admin.local@example.com', role: 'service_admin', status: 'active', groups: ['grp-1'], created_at: ago(60 * 24 * 20) },
  { user_id: 'u-2', email: 'woonyong.dev@gmail.com', role: 'user', status: 'active', groups: ['grp-1', 'grp-2'], created_at: ago(60 * 24 * 5) },
  { user_id: 'u-3', email: 'teammate@example.com', role: 'user', status: 'pending_approval', groups: [], created_at: ago(60) },
];
export const grants: AccessGrant[] = [
  { access_id: 'acc-1', subject_type: 'group', subject_label: 'sre', resource_type: 'cluster', resource_id: 'target', role: 'cluster_steward', granted_at: ago(60 * 24 * 5) },
  { access_id: 'acc-2', subject_type: 'user', subject_label: 'woonyong.dev@gmail.com', resource_type: 'application', resource_id: 'app-checkout', role: 'release_operator', granted_at: ago(60 * 24 * 2) },
];
export const catalogItems: CatalogItem[] = [
  { item_id: 'cat-1', name: 'nginx-ingress', description: 'Ingress 컨트롤러 설치', category: 'networking' },
  { item_id: 'cat-2', name: 'sample-web', description: '샘플 웹 워크로드 + GitOps 연결', category: 'app' },
];
export const nowIso = now;
