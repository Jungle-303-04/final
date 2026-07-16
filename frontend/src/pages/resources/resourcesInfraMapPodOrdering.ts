import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import { podHealthTone } from "./podVisualState";

export function orderInfraMapPodsForMetric(
  pods: readonly InfraMapPod[],
  metricMode: InfraMapMetricMode,
): InfraMapPod[] {
  return [...pods].sort((left, right) =>
    compareInfraMapPodsForMetric(left, right, metricMode)
  );
}

export function compareInfraMapPodsForMetric(
  left: InfraMapPod,
  right: InfraMapPod,
  metricMode: InfraMapMetricMode,
): number {
  const leftProblemRank = infraMapPodProblemRank(left);
  const rightProblemRank = infraMapPodProblemRank(right);
  if (leftProblemRank !== rightProblemRank) return leftProblemRank - rightProblemRank;

  const leftRatio = infraMapPodMetricRatio(left, metricMode);
  const rightRatio = infraMapPodMetricRatio(right, metricMode);
  const leftMissingRank = leftRatio === null ? 1 : 0;
  const rightMissingRank = rightRatio === null ? 1 : 0;
  if (leftMissingRank !== rightMissingRank) return leftMissingRank - rightMissingRank;
  if (leftRatio !== rightRatio) return (rightRatio ?? 0) - (leftRatio ?? 0);

  const leftValue = infraMapPodMetricValue(left, metricMode);
  const rightValue = infraMapPodMetricValue(right, metricMode);
  if (leftValue !== rightValue) return (rightValue ?? 0) - (leftValue ?? 0);

  return left.name.localeCompare(right.name);
}

export function infraMapPodMetricRatio(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
): number | null {
  return metricMode === "cpu" ? pod.cpu.ratio : pod.memory.ratio;
}

export function infraMapPodMetricValue(
  pod: InfraMapPod,
  metricMode: InfraMapMetricMode,
): number | null {
  return metricMode === "cpu" ? pod.cpu.value : pod.memory.value;
}

export function infraMapPodProblemRank(pod: InfraMapPod): number {
  const tone = podHealthTone(pod);
  if (tone === "critical") return 0;
  if (tone === "warning") return 1;
  return 2;
}
