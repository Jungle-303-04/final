import { useI18n } from "../../shared/i18n";
import { ratioSplitText } from "./ResourcesInfraMapMetrics";

export interface InfraMapNodeSummarySource {
  assignedPodCount?: number;
  cpuRatio: number | null;
  memoryRatio: number | null;
  podCapacity: number | null;
  podCount?: number;
}

export interface InfraMapNodeSummaryText {
  cpu: string;
  memory: string;
  pods: string;
}

export function infraMapNodeSummaryText(
  node: InfraMapNodeSummarySource,
  helpers: Pick<ReturnType<typeof useI18n>, "formatNumber" | "t">,
): InfraMapNodeSummaryText {
  const { formatNumber, t } = helpers;
  const podCount = node.assignedPodCount ?? node.podCount ?? 0;
  return {
    cpu: node.cpuRatio === null
      ? t("common.value.unavailable")
      : ratioSplitText(node.cpuRatio, formatNumber),
    memory: node.memoryRatio === null
      ? t("common.value.unavailable")
      : ratioSplitText(node.memoryRatio, formatNumber),
    pods: node.podCapacity === null
      ? formatNumber(podCount)
      : t("resources.infraMap.podCapacityValue", {
          capacity: formatNumber(node.podCapacity),
          count: formatNumber(podCount),
        }),
  };
}

export function infraMapNodePodRatio(
  node: InfraMapNodeSummarySource,
): number | null {
  const podCount = node.assignedPodCount ?? node.podCount ?? 0;
  return node.podCapacity !== null && node.podCapacity > 0
    ? podCount / node.podCapacity
    : null;
}
