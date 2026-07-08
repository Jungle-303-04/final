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
    data: samples.map((sample, index) => ({ x: pointTime(sample, index), y: usageValue(sample, key) })),
  };
}

function restartDeltaSeries(id: string, samples: UsageSample[]): Series {
  return {
    id,
    data: samples.map((sample, index) => {
      const current = usageValue(sample, 'restart_total');
      const previous = index > 0 ? usageValue(samples[index - 1], 'restart_total') : current;
      return { x: pointTime(sample, index), y: Math.max(0, current - previous) };
    }),
  };
}

function usageValue(sample: UsageSample, key: keyof UsageSample['usage']): number {
  const value = Number(sample.usage[key] ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function pointTime(sample: UsageSample, index: number): number {
  const parsed = sample.sampled_at ? Date.parse(sample.sampled_at) : NaN;
  return Number.isFinite(parsed) ? parsed : index + 1;
}
