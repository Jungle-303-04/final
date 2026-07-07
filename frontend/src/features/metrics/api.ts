// 요청형 텔레메트리 쿼리 — 발행(POST /agent/debug/query) 후 실제 결과를
// 명령 상태 조회 경로(GET /commands/{command_id})로 폴링한다. 가짜 완료 표시(고정 타이머·하드코딩 결과) 금지.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '@/shared/lib/api';
import type { MetricQueryPreset, MetricWidget } from '@/shared/lib/types';
import { uiStore } from '@/shared/lib/ui-store';

export interface CommandStatus {
  command_id: string;
  cluster_id: string;
  correlation_id: string;
  action: string;
  status: 'queued' | 'leased' | 'running' | 'completed' | 'failed' | string;
  result: Record<string, unknown>;
  completed_at: string | null;
}

const TERMINAL = new Set(['completed', 'failed']);
export const isTerminal = (s: string | undefined) => !!s && TERMINAL.has(s);

export function useCommandStatus(commandId: string | undefined) {
  return useQuery({
    queryKey: ['commands', commandId ?? ''],
    queryFn: () => get<CommandStatus>(`/commands/${commandId}`),
    enabled: !!commandId,
    refetchInterval: q => (isTerminal(q.state.data?.status) ? false : 2000),
  });
}

export const metricKeys = {
  queryPresets: (clusterId: string | undefined) => ['metric-query-presets', clusterId ?? ''] as const,
  widgets: (clusterId: string | undefined) => ['metric-widgets', clusterId ?? ''] as const,
};

export interface MetricQueryPresetPayload {
  preset_id?: string;
  name: string;
  description?: string;
  source?: 'prometheus';
  query: string;
  range_seconds?: number | null;
  step_seconds?: number | null;
  unit?: string;
  metadata?: Record<string, unknown>;
}

export interface MetricWidgetPayload {
  widget_id?: string;
  query_preset_id: string;
  title: string;
  kind?: 'line' | 'area' | 'bar' | 'stat' | 'table' | 'heatmap';
  position?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface CommandAcceptedResponse {
  accepted?: boolean;
  command_id: string;
  correlation_id?: string;
}

export function useMetricQueryPresets(clusterId: string | undefined) {
  return useQuery({
    queryKey: metricKeys.queryPresets(clusterId),
    queryFn: () => get<{ items: MetricQueryPreset[] }>(`/clusters/${clusterId}/metric-query-presets`),
    enabled: !!clusterId,
    select: d => d.items,
  });
}

export function useMetricWidgets(clusterId: string | undefined) {
  return useQuery({
    queryKey: metricKeys.widgets(clusterId),
    queryFn: () => get<{ items: MetricWidget[] }>(`/clusters/${clusterId}/metric-widgets`),
    enabled: !!clusterId,
    select: d => d.items,
  });
}

export function useUpsertMetricQueryPreset(clusterId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MetricQueryPresetPayload) =>
      post<{ item: MetricQueryPreset }>(`/clusters/${clusterId}/metric-query-presets`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: metricKeys.queryPresets(clusterId) });
      uiStore.getState().toast('ok', '쿼리를 저장했습니다');
    },
    onError: err => uiStore.getState().toast('danger', metricMutationError('쿼리 저장', err)),
  });
}

export function useDeleteMetricQueryPreset(clusterId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (presetId: string) => del<void>(`/clusters/${clusterId}/metric-query-presets/${presetId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: metricKeys.queryPresets(clusterId) });
      qc.invalidateQueries({ queryKey: metricKeys.widgets(clusterId) });
      uiStore.getState().toast('ok', '쿼리를 삭제했습니다');
    },
    onError: err => uiStore.getState().toast('danger', metricMutationError('쿼리 삭제', err)),
  });
}

export function useRunMetricQueryPreset(clusterId: string | undefined) {
  return useMutation({
    mutationFn: (presetId: string) =>
      post<CommandAcceptedResponse>(`/clusters/${clusterId}/metric-query-presets/${presetId}/run`),
    onError: err => uiStore.getState().toast('danger', metricMutationError('쿼리 실행', err)),
  });
}

export function useUpsertMetricWidget(clusterId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MetricWidgetPayload) =>
      post<{ item: MetricWidget }>(`/clusters/${clusterId}/metric-widgets`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: metricKeys.widgets(clusterId) });
      uiStore.getState().toast('ok', '위젯을 저장했습니다');
    },
    onError: err => uiStore.getState().toast('danger', metricMutationError('위젯 저장', err)),
  });
}

export function useDeleteMetricWidget(clusterId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (widgetId: string) => del<void>(`/clusters/${clusterId}/metric-widgets/${widgetId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: metricKeys.widgets(clusterId) });
      uiStore.getState().toast('ok', '위젯을 삭제했습니다');
    },
    onError: err => uiStore.getState().toast('danger', metricMutationError('위젯 삭제', err)),
  });
}

function metricMutationError(action: string, err: unknown): string {
  const e = err as { kind?: string; detail?: string };
  if (e.kind === 'forbidden') return `${action} 권한이 없습니다`;
  if (e.kind === 'invalid') return `${action} 요청이 유효하지 않습니다`;
  return `${action} 실패 — ${e.detail ?? '잠시 후 다시 시도해주세요'}`;
}

// 에이전트가 올린 프로메테우스 결과에서 실측 요약을 계산한다.
// 결과 형태: result.result = { source, results: { <name>: { result_type, samples|series, point_count } } }
export interface QueryResultSummary { series: number; points: number; avg: number | null; max: number | null }

export function summarizeTelemetryResult(result: Record<string, unknown>): QueryResultSummary | null {
  const inner = result['result'] as Record<string, unknown> | undefined;
  const groups = inner?.['results'] as Record<string, Record<string, unknown>> | undefined;
  if (!groups) return null;
  let series = 0;
  let points = 0;
  let sum = 0;
  let numeric = 0;
  let max: number | null = null;
  const feed = (value: number | null) => {
    if (typeof value !== 'number') return;
    sum += value; numeric += 1;
    if (max === null || value > max) max = value;
  };
  for (const entry of Object.values(groups)) {
    const samples = entry['samples'] as { value: number | null }[] | undefined;
    if (Array.isArray(samples)) {
      series += samples.length;
      points += samples.length;
      for (const s of samples) feed(s.value);
      continue;
    }
    const matrix = entry['series'] as { values: { value: number | null }[] }[] | undefined;
    if (Array.isArray(matrix)) {
      series += matrix.length;
      for (const line of matrix) {
        points += line.values.length;
        for (const v of line.values) feed(v.value);
      }
    }
  }
  return { series, points, avg: numeric ? sum / numeric : null, max };
}

export function commandResultMessage(result: Record<string, unknown>): string | null {
  const message = result['message'];
  return typeof message === 'string' && message ? message : null;
}
