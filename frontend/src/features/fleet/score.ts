// 히트맵 건강도 단일 함수 (docs/fd/views/fleet-heatmap)
import type { Cluster, NodeInfo, Workload } from '@/shared/lib/types';

const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function clusterScore(c: Cluster): number {
  if (c.connection_status !== 'connected') return 0.15;
  return clamp(1 - (0.5 * Math.min(1, c.incident_count / 3) + 0.2 * (c.pod_count === 0 ? 1 : 0)));
}
export function nodeScore(n: NodeInfo, pods: Workload[]): number {
  const mine = pods.filter(p => p.node === n.name);
  const bad = mine.filter(p => p.phase !== 'Running').length;
  return clamp((n.ready ? 1 : 0.2) - 0.6 * (mine.length ? bad / mine.length : 0));
}
export function podScore(p: Workload): number {
  if (p.phase === 'CrashLoopBackOff' || p.phase === 'Failed') return 0.05;
  if (p.phase === 'Pending') return 0.5;
  return clamp(1 - Math.min(0.6, p.restarts * 0.08));
}
