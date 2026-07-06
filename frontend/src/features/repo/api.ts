import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import type { Application } from '@/shared/lib/types';
import { uiStore } from '@/shared/lib/ui-store';
import { adaptApplication, adaptDeployment, adaptRun } from '@/shared/lib/adapt';

export interface CreateApplicationInput {
  name: string;
  repo_ref: string;
  branch: string;
  manifest_path: string;
  cluster_id: string;
}

export const repoKeys = {
  apps: () => ['applications'] as const,
  runs: (id: string) => ['applications', id, 'runs'] as const,
  deployments: (id: string) => ['applications', id, 'deployments'] as const,
};
export const useApplications = () =>
  useQuery({ queryKey: repoKeys.apps(), queryFn: () => get<{ applications: Record<string, unknown>[] }>('/applications'), refetchInterval: 30_000, select: d => d.applications.map(adaptApplication) });
export const useApplication = (id: string) =>
  useQuery({
    queryKey: ['applications', id],
    queryFn: () => get<{ application: Record<string, unknown> }>(`/applications/${id}`),
    select: d => adaptApplication(d.application),
  });
const ACTIVE = new Set(['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING']);
export function useRuns(appId: string) {
  return useQuery({
    queryKey: repoKeys.runs(appId),
    queryFn: () => get<{ runs: Record<string, unknown>[] }>(`/applications/${appId}/runs`),
    select: d => d.runs.map(adaptRun),
    // 활성 run 있을 때만 10s, 아니면 60s (docs/fd/views/repo AC)
    refetchInterval: (q) =>
      (q.state.data?.runs.some(r => ACTIVE.has(String(r.status ?? '').toUpperCase())) ? 10_000 : 60_000),
  });
}
export function useRunsAll(apps: Application[]) {
  return useQueries({
    queries: apps.map(a => ({
      queryKey: repoKeys.runs(a.application_id),
      queryFn: () => get<{ runs: Record<string, unknown>[] }>(`/applications/${a.application_id}/runs`),
      // useRuns 와 동일: 활성 run 있으면 10s, 아니면 30s
      refetchInterval: (q: { state: { data?: { runs: Record<string, unknown>[] } } }) =>
        (q.state.data?.runs.some(r => ACTIVE.has(String(r.status ?? '').toUpperCase())) ? 10_000 : 30_000),
    })),
    combine: results => results.map((r, i) => ({
      appId: apps[i]?.application_id ?? '',
      runs: (r.data?.runs ?? []).map(adaptRun),
    })),
  });
}
export const useDeployments = (appId: string) =>
  useQuery({
    queryKey: repoKeys.deployments(appId),
    queryFn: () => get<{ deployments: Record<string, unknown>[] }>(`/applications/${appId}/deployments`),
    select: d => d.deployments.map(adaptDeployment),
  });
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
  return useMutation({
    mutationFn: async (input: CreateApplicationInput) => {
      const created = await post<{ application: Record<string, unknown> }>('/applications', {
        name: input.name,
        repo_ref: input.repo_ref,
        default_branch: input.branch,
        manifest_path: input.manifest_path,
      });
      const app = adaptApplication(created.application);
      await post(`/applications/${app.application_id}/deployments`, {
        cluster_id: input.cluster_id,
        namespace: 'sandbox',
        environment: 'sandbox',
        manifest_path: input.manifest_path,
      });
      return { ...app, branch: input.branch, cluster_id: input.cluster_id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: repoKeys.apps() }),
  });
};
