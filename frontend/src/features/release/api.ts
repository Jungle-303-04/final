import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post, put } from '@/shared/lib/api';
import type {
  ReleaseGeneratedManifest,
  ReleaseManifestSafePr,
  ReleasePlan,
  ReleasePlanPreview,
  ReleaseReadiness,
  ReleaseRun,
} from '@/shared/lib/types';
import { useToast } from '@/ui';
import { releasePlanPayload } from './model';

const RELEASE_REFRESH_MS = 15_000;

export const releaseKeys = {
  plans: () => ['release-plans'] as const,
  runs: (planId?: string) => ['release-runs', planId ?? 'all'] as const,
};

export function useReleasePlans() {
  return useQuery({
    queryKey: releaseKeys.plans(),
    queryFn: () => get<{ plans: ReleasePlan[] }>('/release-plans'),
    select: (data) => data.plans,
  });
}

export function useReleaseRuns(planId?: string) {
  return useQuery({
    queryKey: releaseKeys.runs(planId),
    queryFn: () => get<{ runs: ReleaseRun[] }>(
      `/release-runs${planId ? `?plan_id=${encodeURIComponent(planId)}` : ''}`,
    ),
    select: (data) => data.runs,
    refetchInterval: RELEASE_REFRESH_MS,
  });
}

export function useSaveReleasePlan(planId?: string) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: (plan: ReleasePlan) => {
      const payload = releasePlanPayload(plan);
      return planId
        ? put<{ plan: ReleasePlan }>(`/release-plans/${encodeURIComponent(planId)}`, payload)
        : post<{ plan: ReleasePlan }>('/release-plans', payload);
    },
    onSuccess: ({ plan }) => {
      queryClient.setQueryData<{ plans: ReleasePlan[] }>(releaseKeys.plans(), (current) => {
        if (!current) return { plans: [plan] };
        const exists = current.plans.some((item) => item.plan_id === plan.plan_id);
        return {
          ...current,
          plans: exists
            ? current.plans.map((item) => item.plan_id === plan.plan_id ? plan : item)
            : [plan, ...current.plans],
        };
      });
      void queryClient.invalidateQueries({ queryKey: releaseKeys.plans() });
      push({
        tone: 'success',
        title: planId ? '플랜을 저장했습니다' : '새 플랜을 만들었습니다',
        description: plan.name,
      });
    },
    onError: (error) => push({
      tone: 'danger',
      title: planId ? '플랜 저장 실패' : '플랜 생성 실패',
      description: (error as Error).message,
    }),
  });
}

export function useReleasePreview() {
  return useMutation({
    mutationFn: (plan: ReleasePlan) =>
      post<{ preview: ReleasePlanPreview }>('/release-plans/preview', releasePlanPayload(plan)),
  });
}

export function useReleaseReadiness() {
  return useMutation({
    mutationFn: (plan: ReleasePlan) =>
      post<ReleaseReadiness>('/release-readiness', releasePlanPayload(plan)),
  });
}

export function useStartReleasePlan() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: (plan: ReleasePlan) =>
      post<{ run: ReleaseRun }>('/release-plans/start', releasePlanPayload(plan)),
    onSuccess: ({ run }) => {
      void queryClient.invalidateQueries({ queryKey: releaseKeys.runs(run.plan_id) });
      push({ tone: 'success', title: '워크플로우를 시작했습니다', description: shortId(run.run_id) });
    },
    onError: (error) => push({ tone: 'danger', title: '실행 시작 실패', description: (error as Error).message }),
  });
}

export function useReleaseGeneratedManifest() {
  return useMutation({
    mutationFn: ({ plan, stepIndex }: { plan: ReleasePlan; stepIndex: number }) =>
      post<ReleaseGeneratedManifest>('/release-plans/render-manifest', {
        plan: releasePlanPayload(plan),
        step_index: stepIndex,
      }),
  });
}

export function useSubmitReleaseGeneratedManifestSafePr() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: ({ plan, stepIndex }: { plan: ReleasePlan; stepIndex: number }) =>
      post<ReleaseManifestSafePr>('/release-plans/render-manifest/safe-pr', {
        plan: releasePlanPayload(plan),
        step_index: stepIndex,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['release-runs'] });
      push({
        tone: 'success',
        title: 'Safe PR 요청을 보냈습니다',
        description: `${result.files.length}개 파일 · ${shortId(result.workflow_run_id)}`,
      });
    },
    onError: (error) => push({ tone: 'danger', title: 'Safe PR 요청 실패', description: (error as Error).message }),
  });
}

export function useDeleteReleasePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, force = false }: { planId: string; force?: boolean }) =>
      del<void>(`/release-plans/${encodeURIComponent(planId)}?force=${String(force)}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: releaseKeys.plans() }),
  });
}

export type RunAction = 'advance' | 'pause' | 'resume' | 'retry' | 'rollback' | 'cancel' | 'notify';

export function useReleaseRunAction() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: ({ action, runId, reason }: { action: RunAction; runId: string; reason?: string }) =>
      post<{ run: ReleaseRun }>(`/release-runs/${encodeURIComponent(runId)}/${action}`, { reason }),
    onSuccess: ({ run }, { action }) => {
      void queryClient.invalidateQueries({ queryKey: ['release-runs'] });
      push({ tone: action === 'rollback' || action === 'cancel' ? 'warning' : 'success', title: runActionLabel(action), description: shortId(run.run_id) });
    },
    onError: (error) => push({ tone: 'danger', title: '실행 작업 실패', description: (error as Error).message }),
  });
}

function shortId(value: string) {
  return value.replace(/^release-(?:run|plan)-/, '').slice(0, 12);
}

function runActionLabel(action: RunAction) {
  return {
    advance: '다음 Wave를 시작했습니다',
    pause: '실행을 일시정지했습니다',
    resume: '실행을 재개했습니다',
    retry: '재시도를 요청했습니다',
    rollback: '롤백을 요청했습니다',
    cancel: '실행을 취소했습니다',
    notify: '담당자에게 알렸습니다',
  }[action];
}
