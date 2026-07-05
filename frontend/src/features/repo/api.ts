import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import type { Application, Deployment, WorkflowRun } from '@/shared/lib/types';
import { uiStore } from '@/shared/lib/ui-store';

export const repoKeys = {
  apps: () => ['applications'] as const,
  runs: (id: string) => ['applications', id, 'runs'] as const,
  deployments: (id: string) => ['applications', id, 'deployments'] as const,
};
export const useApplications = () =>
  useQuery({ queryKey: repoKeys.apps(), queryFn: () => get<{ applications: Application[] }>('/applications'), refetchInterval: 30_000, select: d => d.applications });
export const useApplication = (id: string) =>
  useQuery({ queryKey: ['applications', id], queryFn: () => get<Application>(`/applications/${id}`) });
const ACTIVE = new Set(['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING']);
export function useRuns(appId: string) {
  return useQuery({
    queryKey: repoKeys.runs(appId),
    queryFn: () => get<{ runs: WorkflowRun[] }>(`/applications/${appId}/runs`),
    select: d => d.runs,
    // 활성 run 있을 때만 10s, 아니면 60s (docs/fd/views/repo AC)
    refetchInterval: (q) => (q.state.data?.runs.some(r => ACTIVE.has(r.status)) ? 10_000 : 60_000),
  });
}
export function useRunsAll(apps: Application[]) {
  return useQueries({
    queries: apps.map(a => ({
      queryKey: repoKeys.runs(a.application_id),
      queryFn: () => get<{ runs: WorkflowRun[] }>(`/applications/${a.application_id}/runs`),
      refetchInterval: 30_000,
    })),
    combine: results => results.map((r, i) => ({ appId: apps[i]?.application_id ?? '', runs: r.data?.runs ?? [] })),
  });
}
export const useDeployments = (appId: string) =>
  useQuery({ queryKey: repoKeys.deployments(appId), queryFn: () => get<{ deployments: Deployment[] }>(`/applications/${appId}/deployments`), select: d => d.deployments });
export function useApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ approvalId, action }: { approvalId: string; action: 'grant' | 'reject' }) => post(`/approvals/${approvalId}/${action}`),
    onSuccess: (_d, v) => {
      uiStore.getState().toast(v.action === 'grant' ? 'ok' : 'warn', v.action === 'grant' ? '승인 완료 — 배포가 진행됩니다' : '거절했습니다');
      qc.invalidateQueries({ queryKey: repoKeys.apps() });
      qc.invalidateQueries({ predicate: q => q.queryKey[0] === 'applications' });
      qc.invalidateQueries({ predicate: q => q.queryKey[0] === 'ai' });
    },
  });
}
export const useCreateApplication = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<Application>) => post<Application>('/applications', b), onSuccess: () => qc.invalidateQueries({ queryKey: repoKeys.apps() }) });
};
