// 알림 합성 피드 — 3개 실존 소스 정규화(G9 도입 시 이 파일만 교체)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useSyncExternalStore } from 'react';
import { get, post } from '@/shared/lib/api';
import type { DeadLetter, EvidenceRecord, Notice, RcaReportSummary, RecoveryPlanStatus, WorkflowRun } from '@/shared/lib/types';
import { adaptIncident, adaptIncidentDetail } from '@/shared/lib/adapt';
import { useApplications, useRunsAll } from '@/features/repo/api';
import { useIsAdmin } from '@/features/auth/api';
import { uiStore } from '@/shared/lib/ui-store';
import { timeAgo } from '@/shared/lib/format';

const NOTIFICATION_QUERY_TIMEOUT_MS = 8_000;

export const useTimeline = () =>
  useQuery({
    queryKey: ['timeline'],
    queryFn: () => get<{ items: Record<string, unknown>[] }>('/dashboard/rca/timeline?limit=20', { timeoutMs: NOTIFICATION_QUERY_TIMEOUT_MS }),
    refetchInterval: 60_000,
    retry: false,
    select: d => d.items.map(adaptIncident),
  });
export const useIncident = (incidentId: string) =>
  useQuery({
    queryKey: ['incident', incidentId],
    queryFn: () => get<{ item: Record<string, unknown> }>(`/dashboard/rca/incidents/${incidentId}`, { timeoutMs: NOTIFICATION_QUERY_TIMEOUT_MS }),
    enabled: !!incidentId, refetchInterval: 30_000,
    retry: false,
    select: d => adaptIncidentDetail(d.item ?? {}),
  });
// 인시던트 correlation 범위의 저장된 evidence — GET /evidence (세션 워크스페이스 스코프)
export const useEvidence = (correlationId: string | undefined, kind?: string) =>
  useQuery({
    queryKey: ['evidence', correlationId ?? '', kind ?? 'all'],
    queryFn: () => get<{ items: EvidenceRecord[]; has_more: boolean; limit: number; offset: number }>(
      `/evidence?correlation_id=${encodeURIComponent(correlationId ?? '')}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}&limit=100`,
      { timeoutMs: NOTIFICATION_QUERY_TIMEOUT_MS },
    ),
    enabled: !!correlationId, refetchInterval: 30_000,
    retry: false,
  });
// 인시던트 correlation 범위의 RCA report 요약 — GET /rca-reports
export const useRcaReports = (correlationId: string | undefined) =>
  useQuery({
    queryKey: ['rca-reports', correlationId ?? ''],
    queryFn: () => get<{ items: RcaReportSummary[]; has_more: boolean; limit: number; offset: number }>(
      `/rca-reports?correlation_id=${encodeURIComponent(correlationId ?? '')}&limit=50`,
      { timeoutMs: NOTIFICATION_QUERY_TIMEOUT_MS },
    ),
    enabled: !!correlationId, refetchInterval: 30_000,
    retry: false,
    select: d => d.items,
  });
// 인시던트 correlation 기준 recovery plan 상태 — 없으면 상세 화면에서 "생성 전"으로 표시.
export const useRecoveryPlan = (correlationId: string | undefined) =>
  useQuery({
    queryKey: ['recovery-plan', correlationId ?? ''],
    queryFn: () => get<RecoveryPlanStatus>(
      `/rca/recovery-plans/by-correlation/${encodeURIComponent(correlationId ?? '')}`,
      { timeoutMs: NOTIFICATION_QUERY_TIMEOUT_MS },
    ),
    enabled: !!correlationId, refetchInterval: 30_000,
    retry: (failureCount, error) =>
      (error as { kind?: string }).kind !== 'not_found' && failureCount < 2,
  });
export const useDeadLetters = (enabled: boolean) =>
  useQuery({
    queryKey: ['dead-letters'],
    queryFn: () => get<{ dead_letters: DeadLetter[] }>('/dead-letters?limit=20', { timeoutMs: NOTIFICATION_QUERY_TIMEOUT_MS }),
    refetchInterval: 60_000,
    enabled,
    retry: false,
    select: d => d.dead_letters,
  });
export const useReplayDeadLetter = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => post(`/dead-letters/${id}/replay`),
    onSuccess: () => { uiStore.getState().toast('ok', '재처리 이벤트를 발행했습니다'); qc.invalidateQueries({ queryKey: ['dead-letters'] }); },
    onError: err => uiStore.getState().toast('danger', `재처리 실패 — ${(err as Error).message}`),
  });
};

const seenKey = (kind: string) => `notice:lastSeen:${kind}`;
const listeners = new Set<() => void>();
function markSeen(kind: string, at: string) { localStorage.setItem(seenKey(kind), at); listeners.forEach(l => l()); }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

export function useNotices(): { notices: Notice[]; unread: number; markAllSeen: (kind?: string) => void } {
  const admin = useIsAdmin();
  const timeline = useTimeline();
  const dlq = useDeadLetters(admin);
  const apps = useApplications();
  const runs = useRunsAll(apps.data ?? []);
  useSyncExternalStore(subscribe, () => localStorage.getItem(seenKey('any')) ?? '');

  const notices = useMemo<Notice[]>(() => {
    const out: Notice[] = [];
    runs.items.forEach(({ appId, runs: rs }) => rs.filter((r: WorkflowRun) => r.status === 'WAITING_FOR_APPROVAL').forEach((r: WorkflowRun) => out.push({
      id: `apr-${r.run_id}`, kind: 'approval', tone: 'warn',
      title: `배포 승인 필요: ${appId} ${(r.commit_sha ?? '').slice(0, 7)}`, at: r.started_at ?? '', link: `/workflows/${r.run_id}`, read: false,
    })));
    (timeline.data ?? []).forEach(i => out.push({ id: `inc-${i.incident_id}`, kind: 'incident', tone: 'danger', title: `인시던트: ${i.summary}`, at: i.at, link: `/incidents/${i.incident_id}`, read: false }));
    (dlq.data ?? []).filter(d => d.status === 'open').forEach(d => out.push({ id: `dlq-${d.id}`, kind: 'dlq', tone: 'danger', title: `처리 실패 이벤트: ${d.original_subject} (${d.consumer})`, at: d.created_at, link: '/settings/ops', read: false }));
    return out
      .map(n => ({ ...n, read: (localStorage.getItem(seenKey(n.kind)) ?? '') >= n.at }))
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  }, [runs, timeline.data, dlq.data]);

  return {
    notices,
    unread: notices.filter(n => !n.read).length,
    markAllSeen: (kind) => {
      const now = new Date().toISOString();
      (kind ? [kind] : ['approval', 'incident', 'dlq', 'cluster']).forEach(k => markSeen(k, now));
      markSeen('any', now);
    },
  };
}
export { timeAgo };
