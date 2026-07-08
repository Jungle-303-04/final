import type { UsageSample } from '@/features/cluster/api';
import type { FleetClusterSummary } from '@/features/fleet/api';
import type { Series } from '@/ui/charts';

const MAX_HOME_CHART_CLUSTERS = 6;

export function trackedFleetChartClusters(clusters: FleetClusterSummary[]): FleetClusterSummary[] {
  return clusters
    .filter(cluster => cluster.pods_total > 0 || cluster.nodes_total > 0)
    .slice(0, MAX_HOME_CHART_CLUSTERS);
}

export function buildFleetPodSeries(
  clusters: FleetClusterSummary[],
  samplesByCluster: Record<string, UsageSample[]>,
): Series[] {
  return clusters
    .map(cluster => metricSeries(cluster.name, samplesByCluster[cluster.cluster_id] ?? [], 'pod_running'))
    .filter(series => series.data.length > 0);
}

export function buildFleetRestartSeries(
  clusters: FleetClusterSummary[],
  samplesByCluster: Record<string, UsageSample[]>,
): Series[] {
  return clusters
    .map(cluster => restartDeltaSeries(cluster.name, samplesByCluster[cluster.cluster_id] ?? []))
    .filter(series => series.data.length > 0);
}

function metricSeries(id: string, samples: UsageSample[], key: keyof UsageSample['usage']): Series {
  return {
    id,
    data: samples.flatMap((sample, index) => {
      const value = usageValue(sample, key);
      return value == null ? [] : [{ x: pointTime(sample, index), y: value }];
    }),
  };
}

function restartDeltaSeries(id: string, samples: UsageSample[]): Series {
  let previous: number | null = null;
  return {
    id,
    data: samples.flatMap((sample, index) => {
      const current = usageValue(sample, 'restart_total');
      if (current == null) return [];
      const delta = previous == null ? 0 : Math.max(0, current - previous);
      previous = current;
      return [{ x: pointTime(sample, index), y: delta }];
    }),
  };
}

function usageValue(sample: UsageSample, key: keyof UsageSample['usage']): number | null {
  if (!(key in sample.usage)) return null;
  const value = Number(sample.usage[key]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function pointTime(sample: UsageSample, index: number): number {
  const parsed = sample.sampled_at ? Date.parse(sample.sampled_at) : NaN;
  return Number.isFinite(parsed) ? parsed : index + 1;
}
