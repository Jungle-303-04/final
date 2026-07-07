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
  source_type: string;
  cluster_id: string;
}

export interface RepositoryProbe {
  repo_ref: string;
  normalized_repo_ref: string;
  valid: boolean;
  reachable: boolean;
  default_branch?: string | null;
  private?: boolean | null;
  html_url?: string | null;
  warnings: string[];
  errors: string[];
}

export interface RepositoryBranch {
  name: string;
  protected: boolean;
  default: boolean;
}

export interface RepositoryManifestCandidate {
  path: string;
  source_type: 'raw-yaml' | 'raw-json' | 'kustomize' | 'helm' | string;
  display_name: string;
  reason: string;
}

export interface RepositoryManifestValidation {
  repo_ref: string;
  branch: string;
  manifest_path: string;
  valid: boolean;
  status: string;
  validation_mode: string;
  resource_count: number;
  resources: { api_version: string; kind: string; namespace?: string | null; name: string }[];
  warnings: string[];
  errors: string[];
}

export const repoKeys = {
  apps: () => ['applications'] as const,
  runs: (id: string) => ['applications', id, 'runs'] as const,
  deployments: (id: string) => ['applications', id, 'deployments'] as const,
  probe: (repoRef: string) => ['repo-discovery', 'probe', repoRef] as const,
  branches: (repoRef: string) => ['repo-discovery', 'branches', repoRef] as const,
  manifests: (repoRef: string, branch: string) => ['repo-discovery', 'manifests', repoRef, branch] as const,
  validation: (repoRef: string, branch: string, manifestPath: string, sourceType: string) =>
    ['repo-discovery', 'validation', repoRef, branch, manifestPath, sourceType] as const,
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
    combine: results => ({
      // 최초 로딩 여부 — '없음' 을 성급하게 단정하지 않기 위한 신호
      pending: results.some(r => r.isPending),
      items: results.map((r, i) => ({
        appId: apps[i]?.application_id ?? '',
        runs: (r.data?.runs ?? []).map(adaptRun),
      })),
    }),
  });
}
export const useDeployments = (appId: string) =>
  useQuery({
    queryKey: repoKeys.deployments(appId),
    queryFn: () => get<{ deployments: Record<string, unknown>[] }>(`/applications/${appId}/deployments`),
    select: d => d.deployments.map(adaptDeployment),
  });
export const useRepositoryProbe = (repoRef: string, enabled: boolean) =>
  useQuery({
    queryKey: repoKeys.probe(repoRef),
    queryFn: () => post<RepositoryProbe>('/repositories/discovery/probe', { repo_ref: repoRef }),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
export const useRepositoryBranches = (repoRef: string, enabled: boolean) =>
  useQuery({
    queryKey: repoKeys.branches(repoRef),
    queryFn: () => get<{ default_branch?: string | null; branches: RepositoryBranch[]; warnings: string[] }>(
      `/repositories/discovery/branches?repo_ref=${encodeURIComponent(repoRef)}`,
    ),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
export const useRepositoryManifestCandidates = (repoRef: string, branch: string, enabled: boolean) =>
  useQuery({
    queryKey: repoKeys.manifests(repoRef, branch),
    queryFn: () => get<{ candidates: RepositoryManifestCandidate[]; warnings: string[] }>(
      `/repositories/discovery/manifests?repo_ref=${encodeURIComponent(repoRef)}&branch=${encodeURIComponent(branch)}`,
    ),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
export const useRepositoryManifestValidation = (
  repoRef: string,
  branch: string,
  manifestPath: string,
  sourceType: string,
  enabled: boolean,
) =>
  useQuery({
    queryKey: repoKeys.validation(repoRef, branch, manifestPath, sourceType),
    queryFn: () => post<RepositoryManifestValidation>('/repositories/discovery/validate', {
      repo_ref: repoRef,
      branch,
      manifest_path: manifestPath,
      source_type: sourceType,
    }),
    enabled,
    retry: false,
    staleTime: 30_000,
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
    // 승인/거절 실패를 조용히 삼키지 않는다 — 사유(중복 처리·권한)를 그대로 노출
    onError: (err, v) => {
      const e = err as { kind?: string; detail?: string };
      const action = v.action === 'grant' ? '승인' : '거절';
      const reason = e.kind === 'forbidden' ? '권한이 없습니다'
        : e.kind === 'invalid' ? (e.detail ?? '이미 처리된 승인입니다')
        : e.detail ?? '잠시 후 다시 시도해주세요';
      uiStore.getState().toast('danger', `${action} 실패 — ${reason}`);
      // 이미 다른 곳에서 처리됐을 수 있으니 최신 상태로 동기화
      qc.invalidateQueries({ predicate: q => q.queryKey[0] === 'applications' });
    },
  });
}
export const useCreateApplication = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateApplicationInput) => {
      const created = await post<{ application: Record<string, unknown> }>('/applications/connect', {
        name: input.name,
        repo_ref: input.repo_ref,
        branch: input.branch,
        manifest_path: input.manifest_path,
        source_type: input.source_type,
        cluster_id: input.cluster_id,
        namespace: 'sandbox',
        environment: 'sandbox',
      });
      const app = adaptApplication(created.application);
      return { ...app, branch: input.branch, cluster_id: input.cluster_id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: repoKeys.apps() }),
  });
};
