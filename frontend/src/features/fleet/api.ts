// 플릿/클러스터 집계 API — 백엔드 집계 엔드포인트 계약(types)과 1:1
//   GET /fleet/summary            → 플릿 전체 상태(홈 대시보드)
//   GET /clusters/{id}/summary    → 클러스터 단위 집계(워크로드 건강/이벤트/인시던트/사용량)
// 계약이 곧 타입이다 — 필드 누락은 UI 에서 정직한 빈 상태로 처리한다.
import { useQuery } from '@tanstack/react-query';
import { get } from '@/shared/lib/api';

const FLEET_QUERY_TIMEOUT_MS = 8_000;

export type FleetHealth = 'healthy' | 'warning' | 'critical' | 'stale' | 'unknown';

export interface FleetClusterSummary {
  cluster_id: string;
  name: string;
  role?: string;
  health: FleetHealth;
  pods_running: number;
  pods_total: number;
  nodes_ready: number;
  nodes_total: number;
  open_incidents: number;
  restarts_recent: number;
  cpu_pct: number | null;
  mem_pct: number | null;
  last_seen: string | null;
}

export interface FleetTotals {
  clusters: number;
  healthy: number;
  warning: number;
  critical: number;
  stale: number;
  unknown: number;
  open_incidents: number;
  pending_approvals: number;
  running_workflows: number;
  dead_letters: number;
}

export interface FleetSummary { clusters: FleetClusterSummary[]; totals: FleetTotals }

export const fleetKeys = {
  summary: () => ['fleet', 'summary'] as const,
  clusterAgg: (id: string) => ['clusters', id, 'agg'] as const,
};

export const useFleetSummary = () =>
  useQuery({
    queryKey: fleetKeys.summary(),
    queryFn: () => get<FleetSummary>('/fleet/summary', { timeoutMs: FLEET_QUERY_TIMEOUT_MS }),
    refetchInterval: 30_000,
    retry: false,
    select: adaptFleetSummary,
  });

export interface ClusterAggWorkload {
  name: string;
  kind: string;
  namespace: string;
  health: FleetHealth | string;
  ready: string;
  restarts: number;
}

export interface ClusterAggIncident {
  id: string;
  symptom: string;
  root_cause: string | null;
  status: string;
  created_at: string | null;
}

export interface ClusterAggUsage { cpu_pct: number | null; mem_pct: number | null; restarts_total: number }

export interface ClusterAggSummary {
  workloads: ClusterAggWorkload[];
  recent_events: Record<string, unknown>[];
  open_incidents: ClusterAggIncident[];
  usage: ClusterAggUsage;
}

export const useClusterAgg = (id: string | undefined) =>
  useQuery({
    queryKey: fleetKeys.clusterAgg(id ?? ''),
    queryFn: () => get<ClusterAggSummary>(`/clusters/${id}/summary`, { timeoutMs: FLEET_QUERY_TIMEOUT_MS }),
    enabled: !!id,
    refetchInterval: 30_000,
    retry: false,
  });

/* 건강 상태 → 히트맵 점수(0~1)/라벨 — 홈·상세 공용 단일 매핑 */
export const HEALTH_SCORE: Record<FleetHealth, number> = { healthy: 0.92, warning: 0.5, critical: 0.08, stale: 0.28, unknown: 0.36 };
export const HEALTH_LABEL: Record<FleetHealth, string> = { healthy: '정상', warning: '주의', critical: '위험', stale: '스테일', unknown: '미확인' };
export const healthScore = (h: FleetHealth | string): number => HEALTH_SCORE[h as FleetHealth] ?? 0.5;
export const healthLabel = (h: FleetHealth | string): string => HEALTH_LABEL[h as FleetHealth] ?? String(h);

function adaptFleetSummary(raw: FleetSummary): FleetSummary {
  return {
    totals: raw.totals,
    clusters: raw.clusters.map((cluster) => {
      const loose = cluster as FleetClusterSummary & { last_seen_at?: string | null };
      return {
        ...cluster,
        last_seen: cluster.last_seen ?? loose.last_seen_at ?? null,
        cpu_pct: normalizePct(cluster.cpu_pct),
        mem_pct: normalizePct(cluster.mem_pct),
      };
    }),
  };
}

function normalizePct(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value <= 1 ? value * 100 : value;
}
