import type { InfraMapMetricMode } from "./ResourcesInfraMapMetrics";
import type { InfraMapPod } from "./resourcesInfraMapModel";
import { compareNullableMetricDesc } from "./resourcesInfraMapMetricComparison";
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
  const ratioOrder = compareNullableMetricDesc(leftRatio, rightRatio);
  if (ratioOrder !== 0) return ratioOrder;

  const leftValue = infraMapPodMetricValue(left, metricMode);
  const rightValue = infraMapPodMetricValue(right, metricMode);
  const valueOrder = compareNullableMetricDesc(leftValue, rightValue);
  if (valueOrder !== 0) return valueOrder;

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
