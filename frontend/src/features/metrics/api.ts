// 온디맨드 텔레메트리 쿼리 — 발행(POST /agent/debug/query) 후 실제 결과를
// GET /commands/{command_id} 로 폴링한다. 가짜 완료 표시(고정 타이머·하드코딩 결과) 금지.
import { useQuery } from '@tanstack/react-query';
import { get } from '@/shared/lib/api';

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

// agent 가 올린 prometheus 결과에서 실측 요약을 계산한다.
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
