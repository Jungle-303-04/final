import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import { uiStore } from '@/shared/lib/ui-store';
import { adaptCluster, adaptInventoryResource, adaptInventoryResourceDetail, adaptInventorySummary, adaptK8sEventResource, adaptPodResource, adaptServiceResource, adaptWorkloadResource } from '@/shared/lib/adapt';

export interface InventoryResourceIdentity {
  resource_type: string;
  kind: string;
  name: string;
  namespace?: string | null;
}

export const clusterKeys = {
  list: () => ['clusters'] as const,
  summary: (id: string) => ['clusters', id, 'summary'] as const,
  inv: (id: string, kind: string) => ['clusters', id, 'inv', kind] as const,
  detail: (id: string, identity?: InventoryResourceIdentity | null) =>
    ['clusters', id, 'resource-detail', identity?.resource_type ?? '', identity?.kind ?? '', identity?.namespace ?? '', identity?.name ?? ''] as const,
};
export const useClusters = () =>
  useQuery({ queryKey: clusterKeys.list(), queryFn: () => get<{ clusters: Record<string, unknown>[] }>('/clusters'), refetchInterval: 30_000, select: d => d.clusters.map(adaptCluster) });
export const useClusterSummary = (id: string | undefined) =>
  useQuery({ queryKey: clusterKeys.summary(id ?? ''), queryFn: () => get<Record<string, unknown>>(`/clusters/${id}/inventory/summary`), enabled: !!id, refetchInterval: 30_000, select: adaptInventorySummary });
export const usePods = (id: string) =>
  useQuery({ queryKey: clusterKeys.inv(id, 'pods'), queryFn: () => get<{ resources: Record<string, unknown>[] }>(`/clusters/${id}/inventory/resources?resource_type=pod`), enabled: !!id, refetchInterval: 30_000, select: d => d.resources.map(adaptPodResource) });
export const useWorkloads = (id: string) =>
  useQuery({ queryKey: clusterKeys.inv(id, 'workloads'), queryFn: () => get<{ resources: Record<string, unknown>[] }>(`/clusters/${id}/inventory/workloads`), enabled: !!id, refetchInterval: 30_000, select: d => d.resources.map(adaptWorkloadResource) });
export const useResources = (id: string, kind?: string) =>
  useQuery({ queryKey: clusterKeys.inv(id, kind ?? 'all'), queryFn: () => get<{ resources: Record<string, unknown>[] }>(`/clusters/${id}/inventory/resources${kind ? `?resource_type=${kind}` : ''}`), enabled: !!id, select: d => d.resources.map(adaptInventoryResource) });
export const useServices = (id: string) =>
  useQuery({ queryKey: clusterKeys.inv(id, 'services'), queryFn: () => get<{ resources: Record<string, unknown>[] }>(`/clusters/${id}/inventory/services`), enabled: !!id, select: d => d.resources.map(adaptServiceResource) });
export interface UsageSample { sampled_at: string | null; usage: Record<string, number> }
// 스냅샷마다 적재되는 실측 usage 롤업 시계열 — 인벤토리 기반 장기 추이(브라우저 스트림과 별개)
export const useClusterUsage = (id: string | undefined) =>
  useQuery({
    queryKey: ['clusters', id ?? '', 'usage'],
    queryFn: () => get<{ samples: UsageSample[] }>(`/clusters/${id}/usage?limit=288`),
    enabled: !!id,
    refetchInterval: 60_000,
    select: d => d.samples,
  });
export const useClusterEvents = (id: string) =>
  useQuery({ queryKey: clusterKeys.inv(id, 'events'), queryFn: () => get<{ resources: Record<string, unknown>[] }>(`/clusters/${id}/inventory/events`), enabled: !!id, select: d => d.resources.map(adaptK8sEventResource) });
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
      return get<Record<string, unknown>>(`/clusters/${id}/inventory/resource-detail?${params.toString()}`);
    },
    enabled: !!id && !!identity?.resource_type && !!identity?.kind && !!identity?.name,
    refetchInterval: 30_000,
    select: adaptInventoryResourceDetail,
  });

export function useScale(clusterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ns, name, replicas }: { ns: string; name: string; replicas: number }) =>
      post(`/clusters/${clusterId}/namespaces/${ns}/deployments/${name}/scale`, { replicas }),
    onSuccess: () => { uiStore.getState().toast('info', '스케일 명령을 큐에 등록했습니다'); qc.invalidateQueries({ queryKey: clusterKeys.list() }); },
    onError: err => uiStore.getState().toast('danger', commandFailureMessage('스케일', err)),
  });
}
export function useRestart(clusterId: string) {
  return useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) =>
      post(`/clusters/${clusterId}/namespaces/${ns}/deployments/${name}/restart`),
    onSuccess: () => uiStore.getState().toast('info', '재시작 명령을 큐에 등록했습니다'),
    onError: err => uiStore.getState().toast('danger', commandFailureMessage('재시작', err)),
  });
}

// 제어 명령 실패는 조용히 삼키지 않는다 — policy(403)·검증(422) 사유를 그대로 보여줌.
function commandFailureMessage(action: string, err: unknown): string {
  const e = err as { kind?: string; detail?: string };
  if (e.kind === 'forbidden') return `${action} 거부됨 — 권한 또는 정책(policy)이 허용하지 않습니다`;
  if (e.kind === 'invalid') return `${action} 실패 — ${e.detail ?? '요청이 정책 조건에 맞지 않습니다'}`;
  return `${action} 실패 — ${e.detail ?? '잠시 후 다시 시도해주세요'}`;
}
