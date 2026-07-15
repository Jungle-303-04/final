import type {
  ResourceMetricHistoryPoint,
  ResourceMetricsHistoryBatch,
} from "../../features/resources/resourceMetricsHistoryContract";

export interface ResourceMetricLiveSeries {
  resourceId: string;
  points: readonly ResourceMetricHistoryPoint[];
}

export function mergeLiveResourceMetricSeries(
  batch: ResourceMetricsHistoryBatch,
  liveSeries: readonly ResourceMetricLiveSeries[],
): ResourceMetricsHistoryBatch {
  const liveByResource = new Map(liveSeries.map((series) => [series.resourceId, series.points]));
  let changed = false;
  const series = batch.series.map((persisted) => {
    const livePoints = liveByResource.get(persisted.resourceId);
    if (!livePoints || livePoints.length === 0) return persisted;
    const merged = new Map(persisted.points.map((point) => [point.observedAt, point]));
    for (const point of livePoints) merged.set(point.observedAt, point);
    const points = Array.from(merged.values()).sort(
      (left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt),
    );
    if (samePoints(points, persisted.points)) return persisted;
    changed = true;
    return {
      ...persisted,
      points,
      hasSparklinePoints: points.some((point) => point.cpuMillicores !== null),
    };
  });
  return changed ? { ...batch, series } : batch;
}

function samePoints(
  left: readonly ResourceMetricHistoryPoint[],
  right: readonly ResourceMetricHistoryPoint[],
): boolean {
  return left.length === right.length && left.every((point, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      point.observedAt === candidate.observedAt &&
      point.cpuMillicores === candidate.cpuMillicores &&
      point.memoryMebibytes === candidate.memoryMebibytes;
  });
}
