import type {
  RightsizingAction,
  RightsizingMetric,
  RightsizingObservedWorkload,
  RightsizingScan,
} from "./rightsizingContract";

export interface RightsizingContainerGroup {
  container: string;
  rows: readonly RightsizingMetric[];
}

export function groupRightsizingRows(
  rows: readonly RightsizingMetric[],
): readonly RightsizingContainerGroup[] {
  const groups = new Map<string, RightsizingMetric[]>();
  for (const row of rows) {
    const current = groups.get(row.container);
    if (current === undefined) groups.set(row.container, [row]);
    else current.push(row);
  }
  return [...groups].map(([container, grouped]) => ({ container, rows: grouped }));
}

export interface RightsizingScanRow {
  id: string;
  clusterId: string;
  workload: RightsizingObservedWorkload["resource"];
  container: string;
  classification: RightsizingAction;
  freshness: RightsizingObservedWorkload["freshness"];
  replicas: number;
  scaledToZero: boolean;
  impact: RightsizingObservedWorkload["impact"];
  cpu: RightsizingMetric | null;
  memory: RightsizingMetric | null;
}

export type RightsizingClassFilter = RightsizingAction | "actions";

export interface RightsizingRowFilter {
  classification: RightsizingClassFilter;
  kind: string;
  namespace: string;
  query: string;
}

export function flattenRightsizingScans(
  scans: readonly RightsizingScan[],
): readonly RightsizingScanRow[] {
  return scans.flatMap((scan) => {
    if (scan.result.availability === "unavailable") return [];
    return scan.result.workloads.flatMap((workload) =>
      groupRightsizingRows(workload.rows).map((group) => ({
        id: [scan.scope.clusterId, workload.resource.uid, group.container].join("\u0000"),
        clusterId: scan.scope.clusterId,
        workload: workload.resource,
        container: group.container,
        classification: workload.classification,
        freshness: workload.freshness,
        replicas: workload.replicas,
        scaledToZero: workload.scaledToZero,
        impact: workload.impact,
        cpu: group.rows.find((row) => row.resource === "cpu") ?? null,
        memory: group.rows.find((row) => row.resource === "memory") ?? null,
      })));
  });
}

export function rightsizingClassCounts(
  rows: readonly RightsizingScanRow[],
): Readonly<Record<RightsizingAction, number>> {
  const counts: Record<RightsizingAction, number> = {
    increase: 0,
    reduction: 0,
    review: 0,
    in_range: 0,
    need_data: 0,
  };
  for (const row of rows) counts[row.classification] += 1;
  return counts;
}

export function filterRightsizingRows(
  rows: readonly RightsizingScanRow[],
  filter: RightsizingRowFilter,
): readonly RightsizingScanRow[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (
      filter.classification === "actions"
        ? !isActionableRightsizingClass(row.classification)
        : row.classification !== filter.classification
    ) return false;
    if (filter.kind && row.workload.kind !== filter.kind) return false;
    if (filter.namespace && row.workload.namespace !== filter.namespace) return false;
    if (!query) return true;
    return [
      row.clusterId,
      row.workload.kind,
      row.workload.namespace ?? "",
      row.workload.name,
      row.container,
    ].join(" ").toLocaleLowerCase().includes(query);
  });
}

export function isActionableRightsizingClass(
  classification: RightsizingAction,
): boolean {
  return classification === "increase" ||
    classification === "reduction" ||
    classification === "review";
}
