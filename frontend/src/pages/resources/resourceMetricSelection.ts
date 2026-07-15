import type { ResourceSummary } from "../../features/resources/resourcesContract";

const METRIC_RESOURCE_TYPES = new Set(["node", "pod"]);
const MAX_RESOURCE_METRIC_IDS = 100;

export function selectResourceMetricIds(
  detail: ResourceSummary | null,
  rows: readonly ResourceSummary[],
): string[] {
  const candidates = [
    ...(detail && METRIC_RESOURCE_TYPES.has(detail.resourceType) ? [detail] : []),
    ...rows.filter((resource) => METRIC_RESOURCE_TYPES.has(resource.resourceType)),
  ];
  return Array.from(new Set(candidates.map((resource) => resource.inventoryKey)))
    .slice(0, MAX_RESOURCE_METRIC_IDS);
}
