import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import type { ClusterSummary, InventoryResource, K8sEvent, ServiceInfo, Workload } from '@/shared/lib/types';
import { uiStore } from '@/shared/lib/ui-store';
import { adaptCluster } from '@/shared/lib/adapt';

export const clusterKeys = {
  list: () => ['clusters'] as const,
  summary: (id: string) => ['clusters', id, 'summary'] as const,
  inv: (id: string, kind: string) => ['clusters', id, 'inv', kind] as const,
};
export const useClusters = () =>
  useQuery({ queryKey: clusterKeys.list(), queryFn: () => get<{ clusters: Record<string, unknown>[] }>('/clusters'), refetchInterval: 30_000, select: d => d.clusters.map(adaptCluster) });
export const useClusterSummary = (id: string | undefined) =>
  useQuery({ queryKey: clusterKeys.summary(id ?? ''), queryFn: () => get<ClusterSummary>(`/clusters/${id}/inventory/summary`), enabled: !!id, refetchInterval: 30_000 });
export const useWorkloads = (id: string) =>
  useQuery({ queryKey: clusterKeys.inv(id, 'workloads'), queryFn: () => get<{ workloads: Workload[] }>(`/clusters/${id}/inventory/workloads`), refetchInterval: 30_000, select: d => d.workloads });
export const useResources = (id: string, kind?: string) =>
  useQuery({ queryKey: clusterKeys.inv(id, kind ?? 'all'), queryFn: () => get<{ resources: InventoryResource[] }>(`/clusters/${id}/inventory/resources${kind ? `?kind=${kind}` : ''}`), select: d => d.resources });
export const useServices = (id: string) =>
  useQuery({ queryKey: clusterKeys.inv(id, 'services'), queryFn: () => get<{ services: ServiceInfo[] }>(`/clusters/${id}/inventory/services`), select: d => d.services });
export const useClusterEvents = (id: string) =>
  useQuery({ queryKey: clusterKeys.inv(id, 'events'), queryFn: () => get<{ events: K8sEvent[] }>(`/clusters/${id}/inventory/events`), select: d => d.events });

export function useScale(clusterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ns, name, replicas }: { ns: string; name: string; replicas: number }) =>
      post(`/clusters/${clusterId}/namespaces/${ns}/deployments/${name}/scale`, { replicas }),
    onSuccess: () => { uiStore.getState().toast('info', '스케일 명령을 큐에 등록했습니다'); qc.invalidateQueries({ queryKey: clusterKeys.list() }); },
  });
}
export function useRestart(clusterId: string) {
  return useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) =>
      post(`/clusters/${clusterId}/namespaces/${ns}/deployments/${name}/restart`),
    onSuccess: () => uiStore.getState().toast('info', '재시작 명령을 큐에 등록했습니다'),
  });
}
