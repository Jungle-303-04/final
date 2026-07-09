import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, getBlob, del, post, put } from '@/shared/lib/api';
import { useToast } from '@/ui';
import type {
  Diagnostic,
  ReleaseAuditEvent,
  ReleasePlan,
  ReleasePlanDispatch,
  ReleasePlanPreview,
  ReleaseReadiness,
  ReleaseRun,
  ReleaseRunHandoff,
  ReleaseRunSummary,
} from '@/shared/lib/types';

export type ReleaseRunFilter =
  | 'all'
  | 'attention'
  | 'stale'
  | 'active'
  | 'live'
  | 'failed'
  | 'rollback_requested'
  | 'unhealthy'
  | 'waiting_for_approval'
  | 'verification_failed'
  | 'verification_pending_timeout';

export const releaseKeys = {
  plans: () => ['release-plans'] as const,
  plan: (id: string) => ['release-plans', id] as const,
  runs: (planId?: string, filter: ReleaseRunFilter = 'all') => ['release-runs', planId ?? 'all', filter] as const,
  handoff: (runId?: string) => ['release-runs-handoff', runId ?? 'none'] as const,
  audit: (planId?: string, runId?: string, eventType?: string) =>
    ['release-audit', planId ?? 'all', runId ?? 'all', eventType ?? 'all'] as const,
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

export const useReleaseRuns = (planId?: string, filter: ReleaseRunFilter = 'all') =>
  useQuery({
    queryKey: releaseKeys.runs(planId, filter),
    queryFn: () => get<{ runs: ReleaseRun[] }>(releaseRunsPath(planId, filter)),
    select: d => d.runs,
    refetchInterval: 15_000,
  });

function releaseRunsPath(planId?: string, filter: ReleaseRunFilter = 'all') {
  const params = new URLSearchParams();
  if (planId) params.set('plan_id', planId);
  if (filter === 'attention') params.set('attention_only', 'true');
  if (filter === 'stale') params.set('stale_only', 'true');
  if (filter === 'active') params.set('active_only', 'true');
  if (filter === 'live') params.set('live_only', 'true');
  if (filter === 'unhealthy') params.set('unhealthy_only', 'true');
  if (filter === 'verification_failed') params.set('verification_failed_only', 'true');
  if (filter === 'verification_pending_timeout') params.set('verification_pending_timeout_only', 'true');
  if (filter === 'failed' || filter === 'rollback_requested' || filter === 'waiting_for_approval') {
    params.set('status', filter);
  }
  const query = params.toString();
  return `/release-runs${query ? `?${query}` : ''}`;
}

export const useReleaseRunSummary = (planId?: string) =>
  useQuery({
    queryKey: ['release-runs-summary', planId ?? 'all'] as const,
    queryFn: () => get<ReleaseRunSummary>(`/release-runs/summary${planId ? `?plan_id=${encodeURIComponent(planId)}` : ''}`),
    refetchInterval: 15_000,
  });

export const useReleaseRunHandoff = (runId?: string) =>
  useQuery({
    queryKey: releaseKeys.handoff(runId),
    queryFn: () => get<{ handoff: ReleaseRunHandoff }>(`/release-runs/${runId}/handoff`),
    select: d => d.handoff,
    enabled: Boolean(runId),
    refetchInterval: 15_000,
  });

export const useReleaseAudit = (planId?: string, runId?: string, eventType?: string) =>
  useQuery({
    queryKey: releaseKeys.audit(planId, runId, eventType),
    queryFn: () => get<{ events: ReleaseAuditEvent[] }>(releaseAuditPath(planId, runId, eventType, 50)),
    select: d => d.events,
    refetchInterval: 30_000,
  });

export function useReleaseAuditExport(planId?: string, runId?: string, eventType?: string) {
  const { push } = useToast();
  return useMutation({
    mutationFn: () => getBlob(releaseAuditPath(planId, runId, eventType, 500, true)),
    onSuccess: blob => {
      const scope = runId ? `-${runId}` : planId ? `-${planId}` : '';
      const eventSuffix = eventType ? `-${eventType.replaceAll('.', '-')}` : '';
      downloadBlob(blob, `release-audit${scope}${eventSuffix}.csv`);
      push({ tone: 'success', title: 'Audit export ready', description: 'Release audit CSV has been downloaded.' });
    },
    onError: err => push({ tone: 'danger', title: 'Audit export failed', description: (err as Error).message || 'Please try again.' }),
  });
}

function releaseAuditPath(
  planId?: string,
  runId?: string,
  eventType?: string,
  limit = 50,
  exportCsv = false,
) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (planId) params.set('plan_id', planId);
  if (runId) params.set('run_id', runId);
  if (eventType) params.set('event_type', eventType);
  return `/release-audit${exportCsv ? '/export' : ''}?${params.toString()}`;
}

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

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function useReleaseReadiness() {
  return useMutation({
    mutationFn: (plan: ReleasePlan) => post<ReleaseReadiness>('/release-readiness', plan),
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

export function useNotifyReleaseRun() {
  return useRunAction('notify', 'Release notification requested');
}

function useRunAction(action: 'advance' | 'pause' | 'resume' | 'retry' | 'rollback' | 'cancel' | 'notify', message: string) {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: ({ runId, reason }: { runId: string; reason?: string }) =>
      post<{ run: ReleaseRun }>(`/release-runs/${runId}/${action}`, { reason }),
    onSuccess: () => {
      push({
        tone: action === 'rollback' || action === 'cancel' || action === 'notify' ? 'warning' : 'success',
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
  return typeof q.queryKey[0] === 'string' && (
    q.queryKey[0].startsWith('release-runs') || q.queryKey[0].startsWith('release-audit')
  );
}
