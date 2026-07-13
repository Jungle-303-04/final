import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { del, get, post } from '@/shared/lib/api';
import { adaptCluster, adaptInventoryResource, adaptInventoryResourceDetail, adaptInventorySummary, adaptK8sEventResource, adaptPodResource, adaptServiceResource, adaptWorkloadResource } from '@/shared/lib/adapt';
import type { Workload } from '@/shared/lib/types';

const CLUSTER_QUERY_TIMEOUT_MS = 8_000;
const OBSERVABILITY_SYSTEM_NAMESPACES = new Set([
  'cert-manager',
  'kube-node-lease',
  'kube-public',
  'kube-system',
  'management',
  'monitoring',
  'target',
]);
const OBSERVABILITY_AGENT_NAME_MARKERS = [
  'cluster-agent',
  'node-collector',
  'opentelemetry',
  'prometheus',
  'loki',
  'tempo',
  'grafana',
  'kube-state-metrics',
];

export interface InventoryResourceIdentity {
  resource_type: string;
  kind: string;
  name: string;
  namespace?: string | null;
}

export interface NodeHeatmapSummary {
  id: string;
  name: string;
  pods_running: number;
  health: 'healthy' | 'warning' | 'critical' | 'unknown' | string;
  cpu_pct: number | null;
  mem_pct: number | null;
  conditions: string[];
}

export interface PodHeatmapSummary {
  id: string;
  name: string;
  namespace: string;
  phase: string;
  ready: string;
  owner: string;
  owner_kind: string;
  node?: string;
  restarts: number;
  cpu_pct: number | null;
  mem_pct: number | null;
  cpu_mcores: number | null;
  mem_mib: number | null;
  health: 'healthy' | 'warning' | 'critical' | 'unknown' | string;
  incident_correlation_id?: string | null;
  incident_id?: string | null;
}

export interface ClusterUnregisterResponse {
  unregistered?: boolean;
  cluster_id?: string;
  agent_remove_command?: string;
  remove_command?: string;
}

export const clusterKeys = {
  list: () => ['clusters'] as const,
  summary: (id: string) => ['clusters', id, 'summary'] as const,
  inv: (id: string, kind: string) => ['clusters', id, 'inv', kind] as const,
  nodesSummary: (id: string) => ['clusters', id, 'nodes-summary'] as const,
  nodePodsSummary: (id: string, node: string) => ['clusters', id, 'nodes', node, 'pods-summary'] as const,
  detail: (id: string, identity?: InventoryResourceIdentity | null) =>
    ['clusters', id, 'resource-detail', identity?.resource_type ?? '', identity?.kind ?? '', identity?.namespace ?? '', identity?.name ?? ''] as const,
};
export const useClusters = () =>
  useQuery({
    queryKey: clusterKeys.list(),
    queryFn: () => get<{ clusters: Record<string, unknown>[] }>('/clusters', { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS }),
    refetchInterval: 30_000,
    retry: false,
    select: d => d.clusters.map(adaptCluster),
  });
export const useClusterSummary = (id: string | undefined) =>
  useQuery({
    queryKey: clusterKeys.summary(id ?? ''),
    queryFn: () => get<Record<string, unknown>>(`/clusters/${id}/inventory/summary`, { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS }),
    enabled: !!id,
    refetchInterval: 30_000,
    retry: false,
    select: adaptInventorySummary,
  });
export const useNodeSummaries = (id: string | undefined) =>
  useQuery({
    queryKey: clusterKeys.nodesSummary(id ?? ''),
    queryFn: () => get<{ nodes: Record<string, unknown>[] }>(`/clusters/${id}/nodes/summary`, { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS })
      .then(response => response.nodes.map(adaptNodeHeatmapSummary)),
    enabled: !!id,
    refetchInterval: 30_000,
    retry: false,
  });
export const useNodePodSummaries = (id: string | undefined, node: string | undefined) =>
  useQuery({
    queryKey: clusterKeys.nodePodsSummary(id ?? '', node ?? ''),
    queryFn: () => get<{ pods: Record<string, unknown>[] }>(
      `/clusters/${id}/nodes/${encodeURIComponent(node ?? '')}/pods/summary`,
      { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS },
    ).then(response => response.pods.map(adaptPodHeatmapSummary).filter(isObservableHeatmapPod)),
    enabled: !!id && !!node,
    refetchInterval: 30_000,
    retry: false,
  });
export const usePods = (id: string) =>
  useQuery({
    queryKey: clusterKeys.inv(id, 'pods'),
    queryFn: () => get<{ resources: Record<string, unknown>[] }>(`/clusters/${id}/inventory/resources?resource_type=pod`, { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS }),
    enabled: !!id,
    refetchInterval: 30_000,
    retry: false,
    select: d => d.resources.map(adaptPodResource).filter(isObservableWorkloadPod),
  });
export const useWorkloads = (id: string) =>
  useQuery({
    queryKey: clusterKeys.inv(id, 'workloads'),
    queryFn: () => get<{ resources: Record<string, unknown>[] }>(`/clusters/${id}/inventory/workloads`, { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS }),
    enabled: !!id,
    refetchInterval: 30_000,
    retry: false,
    select: d => d.resources.map(adaptWorkloadResource).filter(isObservableConsoleResource),
  });
export const useResources = (id: string, kind?: string) =>
  useQuery({
    queryKey: clusterKeys.inv(id, kind ?? 'all'),
    queryFn: () => get<{ resources: Record<string, unknown>[] }>(`/clusters/${id}/inventory/resources${kind ? `?resource_type=${kind}` : ''}`, { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS }),
    enabled: !!id,
    retry: false,
    select: d => d.resources.map(adaptInventoryResource).filter(isObservableConsoleResource),
  });
export const useServices = (id: string) =>
  useQuery({
    queryKey: clusterKeys.inv(id, 'services'),
    queryFn: () => get<{ resources: Record<string, unknown>[] }>(`/clusters/${id}/inventory/services`, { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS }),
    enabled: !!id,
    retry: false,
    select: d => d.resources.map(adaptServiceResource).filter(isObservableConsoleResource),
  });
export interface UsageSample { sampled_at: string | null; usage: Record<string, number> }
// 스냅샷마다 적재되는 실측 usage 롤업 시계열 — 인벤토리 기반 장기 추이(브라우저 스트림과 별개)
export const useClusterUsage = (id: string | undefined) =>
  useQuery({
    queryKey: ['clusters', id ?? '', 'usage'],
    queryFn: () => get<{ samples: UsageSample[] }>(`/clusters/${id}/usage?limit=288`, { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS }),
    enabled: !!id,
    refetchInterval: 60_000,
    retry: false,
    select: d => d.samples,
  });
export const useClusterEvents = (id: string) =>
  useQuery({
    queryKey: clusterKeys.inv(id, 'events'),
    queryFn: () => get<{ resources: Record<string, unknown>[] }>(`/clusters/${id}/inventory/events`, { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS }),
    enabled: !!id,
    retry: false,
    select: d => d.resources.filter(isObservableRawResource).map(adaptK8sEventResource).filter(isObservableConsoleResource),
  });
export const useInventoryResourceDetail = (id: string, identity: InventoryResourceIdentity | null) =>
  useQuery({
    queryKey: clusterKeys.detail(id, identity),
    queryFn: () => {
      const params = new URLSearchParams({
        resource_type: identity?.resource_type ?? '',
        kind: identity?.kind ?? '',
        name: identity?.name ?? '',
      });
      if (identity?.namespace) params.set('namespace', identity.namespace);
      return get<Record<string, unknown>>(`/clusters/${id}/inventory/resource-detail?${params.toString()}`, { timeoutMs: CLUSTER_QUERY_TIMEOUT_MS });
    },
    enabled: !!id && !!identity?.resource_type && !!identity?.kind && !!identity?.name,
    refetchInterval: 30_000,
    retry: false,
    select: adaptInventoryResourceDetail,
  });

export function useScale(clusterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ns, name, replicas }: { ns: string; name: string; replicas: number }) =>
      post(`/clusters/${clusterId}/namespaces/${ns}/deployments/${name}/scale`, { replicas }),
    onSuccess: () => {
      toast.info('스케일 명령 등록', { description: '명령 상태는 워크로드 상태에서 이어서 확인됩니다' });
      invalidateClusterRuntime(qc, clusterId);
    },
    onError: (err) => {
      toast.error('스케일 실패', { description: commandFailureMessage('스케일', err) });
    },
  });
}
export function useRestart(clusterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) =>
      post(`/clusters/${clusterId}/namespaces/${ns}/deployments/${name}/restart`, {}),
    onSuccess: () => {
      toast.info('재시작 명령 등록', { description: '대상 행의 상태가 갱신되면 목록에 반영됩니다' });
      invalidateClusterRuntime(qc, clusterId);
    },
    onError: (err) => {
      toast.error('재시작 실패', { description: commandFailureMessage('재시작', err) });
    },
  });
}

function invalidateClusterRuntime(qc: ReturnType<typeof useQueryClient>, clusterId: string) {
  qc.invalidateQueries({ queryKey: clusterKeys.list() });
  qc.invalidateQueries({ queryKey: ['clusters', clusterId] });
}

export function useUnregisterCluster(clusterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => del<ClusterUnregisterResponse | undefined>(`/clusters/${clusterId}`),
    onSuccess: () => {
      toast.success('클러스터 등록 해제 완료', { description: '에이전트 제거 명령을 대상 클러스터에서 실행하세요' });
      qc.invalidateQueries({ queryKey: clusterKeys.list() });
    },
    onError: (err) => {
      toast.error('등록 해제 실패', { description: clusterUnregisterFailureMessage(err) });
    },
  });
}

function adaptNodeHeatmapSummary(raw: Record<string, unknown>): NodeHeatmapSummary {
  const conditions = raw.conditions;
  return {
    id: String(raw.id ?? raw.node ?? raw.name ?? raw.node_name ?? ''),
    name: String(raw.name ?? raw.node_name ?? raw.node ?? ''),
    pods_running: measuredNumber(raw.pods_running ?? raw.running_pods ?? raw.pod_count ?? raw.pods_total) ?? 0,
    health: String(raw.health ?? nodeHealthFromConditions(conditions, raw.ready)),
    cpu_pct: numberOrNull(raw.cpu_pct ?? raw.cpu_percent ?? raw.cpu_ratio),
    mem_pct: numberOrNull(raw.mem_pct ?? raw.memory_pct ?? raw.mem_ratio),
    conditions: normalizeConditions(conditions),
  };
}

function adaptPodHeatmapSummary(raw: Record<string, unknown>): PodHeatmapSummary {
  const summary = (raw.summary ?? {}) as Record<string, unknown>;
  const namespace = String(raw.namespace ?? summary.namespace ?? '');
  const name = String(raw.name ?? summary.name ?? '');
  const phase = String(raw.phase ?? raw.status ?? summary.phase ?? 'Unknown');
  const restarts = Number(raw.restarts ?? raw.restart_count ?? raw.restart_total ?? summary.restart_total ?? 0);
  return {
    id: `${namespace}/${name}`,
    name,
    namespace,
    phase,
    ready: String(raw.ready ?? summary.ready ?? ''),
    owner: String(raw.owner ?? raw.owner_name ?? summary.owner_name ?? raw.node ?? summary.node_name ?? ''),
    owner_kind: String(raw.owner_kind ?? summary.owner_kind ?? ''),
    node: String(raw.node ?? summary.node_name ?? '') || undefined,
    restarts,
    cpu_pct: numberOrNull(raw.cpu_pct ?? raw.cpu_percent ?? summary.cpu_pct ?? summary.cpu_ratio),
    mem_pct: numberOrNull(raw.mem_pct ?? raw.memory_pct ?? summary.mem_pct ?? summary.mem_ratio),
    cpu_mcores: measuredNumber(raw.cpu_mcores ?? summary.cpu_mcores),
    mem_mib: measuredNumber(raw.mem_mib ?? raw.memory_mib ?? summary.mem_mib ?? summary.memory_mib),
    health: String(raw.health ?? podHealth(phase, restarts)),
    incident_correlation_id: (raw.incident_correlation_id ?? summary.incident_correlation_id ?? null) as string | null,
    incident_id: (raw.incident_id ?? summary.incident_id ?? null) as string | null,
  };
}

function isObservableWorkloadPod(pod: Workload): boolean {
  const namespace = pod.namespace.toLowerCase();
  if (OBSERVABILITY_SYSTEM_NAMESPACES.has(namespace)) return false;
  const haystack = [
    pod.name,
    pod.workload_name,
    pod.kind,
  ].filter(Boolean).join(' ').toLowerCase();
  return !OBSERVABILITY_AGENT_NAME_MARKERS.some(marker => haystack.includes(marker));
}

function isObservableHeatmapPod(pod: PodHeatmapSummary): boolean {
  const namespace = pod.namespace.toLowerCase();
  if (OBSERVABILITY_SYSTEM_NAMESPACES.has(namespace)) return false;
  const haystack = [pod.name, pod.owner, pod.owner_kind].filter(Boolean).join(' ').toLowerCase();
  return !OBSERVABILITY_AGENT_NAME_MARKERS.some(marker => haystack.includes(marker));
}

function isObservableConsoleResource(resource: { namespace?: string | null; name?: string; kind?: string; resource_type?: string; target?: string }): boolean {
  const namespace = String(resource.namespace ?? '').toLowerCase();
  if (namespace && OBSERVABILITY_SYSTEM_NAMESPACES.has(namespace)) return false;
  const haystack = [
    resource.name,
    resource.kind,
    resource.resource_type,
    resource.target,
  ].filter(Boolean).join(' ').toLowerCase();
  return !OBSERVABILITY_AGENT_NAME_MARKERS.some(marker => haystack.includes(marker));
}

function isObservableRawResource(resource: Record<string, unknown>): boolean {
  const summary = (resource.summary ?? {}) as Record<string, unknown>;
  const namespace = String(
    resource.namespace ??
    summary.namespace ??
    summary.involved_namespace ??
    '',
  ).toLowerCase();
  if (namespace && OBSERVABILITY_SYSTEM_NAMESPACES.has(namespace)) return false;
  const haystack = [
    resource.name,
    resource.kind,
    resource.resource_type,
    summary.name,
    summary.owner_name,
    summary.involved_name,
    summary.involved_kind,
  ].filter(Boolean).join(' ').toLowerCase();
  return !OBSERVABILITY_AGENT_NAME_MARKERS.some(marker => haystack.includes(marker));
}

function numberOrNull(value: unknown): number | null {
  const parsed = measuredNumber(value);
  if (parsed == null) return null;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function measuredNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeConditions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, active]) => active === true || active === 'True' || active === 'true')
    .map(([condition]) => condition);
}

function nodeHealthFromConditions(conditions: unknown, ready: unknown) {
  const active = normalizeConditions(conditions).map((item) => item.toLowerCase());
  if (ready === false || active.includes('notready')) return 'critical';
  if (active.some((item) => item.includes('pressure'))) return 'warning';
  return 'healthy';
}

function podHealth(phase: string, restarts: number) {
  const key = phase.toLowerCase();
  if (['failed', 'crashloopbackoff', 'error', 'unknown'].includes(key)) return 'critical';
  if (['pending', 'containercreating'].includes(key) || restarts > 0) return 'warning';
  return 'healthy';
}

function clusterUnregisterFailureMessage(err: unknown): string {
  const e = err as { detail?: string };
  if (e.detail?.includes('has_deployments')) return '등록 해제 실패 - 연결된 배포 정의를 먼저 해제하세요';
  return `등록 해제 실패 - ${e.detail ?? '잠시 후 다시 시도해주세요'}`;
}

// 제어 명령 실패는 조용히 삼키지 않는다 — policy(403)·검증(422) 사유를 그대로 보여줌.
function commandFailureMessage(action: string, err: unknown): string {
  const e = err as { kind?: string; detail?: string };
  if (e.kind === 'forbidden') return `${action} 거부됨 — 권한 또는 정책(policy)이 허용하지 않습니다`;
  if (e.kind === 'invalid') return `${action} 실패 — ${e.detail ?? '요청이 정책 조건에 맞지 않습니다'}`;
  return `${action} 실패 — ${e.detail ?? '잠시 후 다시 시도해주세요'}`;
}
