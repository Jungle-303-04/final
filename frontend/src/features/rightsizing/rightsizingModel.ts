import type { RightsizingMetric } from "./rightsizingContract";

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
