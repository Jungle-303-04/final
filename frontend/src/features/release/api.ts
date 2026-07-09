import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, del, post, put } from '@/shared/lib/api';
import { useToast } from '@/ui';
import type { Diagnostic, ReleasePlan, ReleasePlanDispatch, ReleasePlanPreview, ReleaseRun, ReleaseRunSummary } from '@/shared/lib/types';

export const releaseKeys = {
  plans: () => ['release-plans'] as const,
  plan: (id: string) => ['release-plans', id] as const,
  runs: (planId?: string) => ['release-runs', planId ?? 'all'] as const,
};

export const diagnosticsKeys = {
  check: (mode: string, signature: string) => ['diagnostics', mode, signature] as const,
};

export const useReleasePlans = () =>
  useQuery({
    queryKey: releaseKeys.plans(),
    queryFn: () => get<{ plans: ReleasePlan[] }>('/release-plans'),
    select: d => d.plans,
  });

export const useReleasePlan = (id: string) =>
  useQuery({
    queryKey: releaseKeys.plan(id),
    queryFn: () => get<{ plan: ReleasePlan }>(`/release-plans/${id}`),
    select: d => d.plan,
    enabled: Boolean(id),
  });

export const useReleaseRuns = (planId?: string) =>
  useQuery({
    queryKey: releaseKeys.runs(planId),
    queryFn: () => get<{ runs: ReleaseRun[] }>(`/release-runs${planId ? `?plan_id=${encodeURIComponent(planId)}` : ''}`),
    select: d => d.runs,
    refetchInterval: 15_000,
  });

export const useReleaseRunSummary = (planId?: string) =>
  useQuery({
    queryKey: ['release-runs-summary', planId ?? 'all'] as const,
    queryFn: () => get<ReleaseRunSummary>(`/release-runs/summary${planId ? `?plan_id=${encodeURIComponent(planId)}` : ''}`),
    refetchInterval: 15_000,
  });

export function useSaveReleasePlan(planId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: ReleasePlan) =>
      planId
        ? put<{ plan: ReleasePlan }>(`/release-plans/${planId}`, plan)
        : post<{ plan: ReleasePlan }>('/release-plans', plan),
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: releaseKeys.plans() });
      if (data.plan.plan_id) qc.invalidateQueries({ queryKey: releaseKeys.plan(data.plan.plan_id) });
    },
  });
}

export function useDiagnostics() {
  return useMutation({
    mutationFn: (body: { mode: 'yaml' | 'settings' | 'release_plan'; content?: string; settings?: unknown; context?: unknown }) =>
      post<{ diagnostics: Diagnostic[] }>('/diagnostics', body),
  });
}

export function useReleasePreview() {
  return useMutation({
    mutationFn: (plan: ReleasePlan) => post<{ preview: ReleasePlanPreview }>('/release-plans/preview', plan),
  });
}

export function useDispatchReleasePlan() {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: ({ plan, wave }: { plan: ReleasePlan; wave: number }) =>
      post<ReleasePlanDispatch>(`/release-plans/dispatch?wave=${wave}`, plan),
    onSuccess: data => {
      push({
        tone: 'success',
        title: 'Dispatch completed',
        description: `Dispatched wave ${data.wave} (${data.events.length} event${data.events.length === 1 ? '' : 's'})`,
      });
      qc.invalidateQueries({ predicate: isReleaseRunQuery });
    },
  });
}

export function useArchiveReleasePlan(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      post<{ plan: ReleasePlan }>(`/release-plans/${planId}/archive`, { reason }),
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: releaseKeys.plans() });
      qc.invalidateQueries({ queryKey: releaseKeys.plan(data.plan.plan_id || planId) });
      qc.invalidateQueries({ predicate: isReleaseRunQuery });
    },
  });
}

export function useDeleteReleasePlan(planId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, boolean>({
    mutationFn: (force: boolean) => del<void>(`/release-plans/${planId}?force=${String(force)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: releaseKeys.plans() });
      qc.invalidateQueries({ predicate: isReleaseRunQuery });
    },
  });
}

export function useDeleteReleaseRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, force = false }: { runId: string; force?: boolean }) =>
      del<void>(`/release-runs/${runId}?force=${String(force)}`),
    onSuccess: () => qc.invalidateQueries({ predicate: isReleaseRunQuery }),
  });
}

export function useStartReleasePlan() {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: (plan: ReleasePlan) => post<{ run: ReleaseRun }>('/release-plans/start', plan),
    onSuccess: data => {
      push({
        tone: 'success',
        title: 'Release run started',
        description: `Started release run ${shortRun(data.run.run_id)}`,
      });
      qc.invalidateQueries({ predicate: isReleaseRunQuery });
    },
  });
}

export function useAdvanceReleaseRun() {
  return useRunAction('advance', 'Advanced release run');
}

export function usePauseReleaseRun() {
  return useRunAction('pause', 'Paused release run');
}

export function useResumeReleaseRun() {
  return useRunAction('resume', 'Resumed release run');
}

export function useRetryReleaseRun() {
  return useRunAction('retry', 'Retry dispatched');
}

export function useRollbackReleaseRun() {
  return useRunAction('rollback', 'Rollback requested');
}

export function useCancelReleaseRun() {
  return useRunAction('cancel', 'Release run cancelled');
}

function useRunAction(action: 'advance' | 'pause' | 'resume' | 'retry' | 'rollback' | 'cancel', message: string) {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: ({ runId, reason }: { runId: string; reason?: string }) =>
      post<{ run: ReleaseRun }>(`/release-runs/${runId}/${action}`, { reason }),
    onSuccess: () => {
      push({
        tone: action === 'rollback' || action === 'cancel' ? 'warning' : 'success',
        title: message,
        description: `Release run ${action} action completed.`,
      });
      qc.invalidateQueries({ predicate: isReleaseRunQuery });
    },
  });
}

function shortRun(runId: string) {
  return runId.replace('release-run-', '').slice(0, 8);
}

function isReleaseRunQuery(q: { queryKey: readonly unknown[] }) {
  return typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith('release-runs');
}
