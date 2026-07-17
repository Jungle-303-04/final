import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapPod } from "./resourcesInfraMapModel";

export type InfraMapPodSizeRange = {
  max: number;
  min: number;
} & (
  | { base: number }
  | { fallback: number }
);

export interface InfraMapPodRequestRange {
  max: number;
  min: number;
}

export function infraMapPodMetricRequest(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
): number | null {
  return metricMode === "cpu" ? pod.cpu.request : pod.memory.request;
}

export function infraMapPodRequestRange(
  pods: readonly InfraMapPod[],
  metricMode: InfraMapMetricMode,
): InfraMapPodRequestRange | null {
  const requests = pods
    .map((pod) => infraMapPodMetricRequest(pod, metricMode))
    .filter(isPositiveMetric);
  if (requests.length === 0) return null;
  return {
    max: Math.max(...requests),
    min: Math.min(...requests),
  };
}

export function infraMapPodSizeFromRequest(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
  requestRange: InfraMapPodRequestRange | null,
  sizeRange: InfraMapPodSizeRange,
): number {
  const request = infraMapPodMetricRequest(pod, metricMode);
  const fallbackSize = "fallback" in sizeRange
    ? sizeRange.fallback
    : sizeRange.base;
  if (!requestRange || !isPositiveMetric(request) || requestRange.max <= requestRange.min) {
    return fallbackSize;
  }
  const normalized = Math.sqrt((request - requestRange.min) / (requestRange.max - requestRange.min));
  const size = sizeRange.min + normalized * (sizeRange.max - sizeRange.min);
  return Math.round(size);
}

function isPositiveMetric(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}
