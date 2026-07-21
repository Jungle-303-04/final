import { useEffect, useState } from "react";

import { getFleetSummary } from "../api/fleet";
import type { FleetClusterSummary } from "../api/schemas";

// UI-PHASE2-001 §5.2: a typed live adapter for the Home/cluster cards. Usage,
// health and open-incident counts come from the bounded workspace fleet rollup.
// Missing CPU/MEM (`cpu_pct`/`mem_pct` null) stays null — an honest "not
// observed" — and is never backfilled with a generated value.

export type ClusterSummaryStatus = "loading" | "ready" | "unavailable";

export interface ClusterSummaryView {
  status: ClusterSummaryStatus;
  health: string | null;
  cpuPct: number | null;
  memPct: number | null;
  podsRunning: number | null;
  podsTotal: number | null;
  nodesReady: number | null;
  nodesTotal: number | null;
  openIncidents: number;
}

const UNAVAILABLE: ClusterSummaryView = {
  status: "unavailable",
  health: null,
  cpuPct: null,
  memPct: null,
  podsRunning: null,
  podsTotal: null,
  nodesReady: null,
  nodesTotal: null,
  openIncidents: 0,
};

export function toClusterSummaryView(detail: FleetClusterSummary): ClusterSummaryView {
  return {
    status: "ready",
    health: detail.health,
    cpuPct: detail.cpu_pct,
    memPct: detail.mem_pct,
    podsRunning: detail.pods_running,
    podsTotal: detail.pods_total,
    nodesReady: detail.nodes_ready,
    nodesTotal: detail.nodes_total,
    openIncidents: detail.open_incidents,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

/**
 * Reads one bounded fleet rollup for every visible card. The previous per-card
 * `/clusters/{id}/summary` fan-out returned full workload inventories and could
 * saturate the shared gateway before Home rendered. One rollup keeps the card
 * contract live while avoiding an N-request waterfall.
 */
export function useClusterSummaries(
  clusterIds: readonly string[],
): Record<string, ClusterSummaryView> {
  const [summaries, setSummaries] = useState<Record<string, ClusterSummaryView>>({});
  const key = clusterIds.join(" ");
  useEffect(() => {
    const ids = key ? key.split(" ") : [];
    if (ids.length === 0) return undefined;
    const controller = new AbortController();
    void getFleetSummary(controller.signal)
      .then((fleet) => {
        if (controller.signal.aborted) return;
        const byId = new Map(fleet.clusters.map((item) => [item.cluster_id, item]));
        setSummaries(Object.fromEntries(ids.map((id) => {
          const item = byId.get(id);
          return [id, item === undefined ? UNAVAILABLE : toClusterSummaryView(item)];
        })));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setSummaries(Object.fromEntries(ids.map((id) => [id, UNAVAILABLE])));
      });
    return () => controller.abort();
  }, [key]);
  return summaries;
}
