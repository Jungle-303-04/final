import { useEffect, useState } from "react";

import { getClusterSummary } from "../api/cluster-summary";
import type { ClusterSummaryDetail } from "../api/cluster-summary-schemas";

// UI-PHASE2-001 §5.2: a typed live adapter for the Home/cluster cards. Usage,
// health and open-incident counts come from `GET /api/clusters/{id}/summary`.
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

export function toClusterSummaryView(detail: ClusterSummaryDetail): ClusterSummaryView {
  const usage = detail.usage;
  return {
    status: "ready",
    health: detail.health,
    cpuPct: usage?.cpu_pct ?? null,
    memPct: usage?.mem_pct ?? null,
    podsRunning: usage?.pods_running ?? null,
    podsTotal: usage?.pods_total ?? null,
    nodesReady: usage?.nodes_ready ?? null,
    nodesTotal: usage?.nodes_total ?? null,
    openIncidents: detail.open_incidents.length,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

/**
 * Reads one live summary per cluster. A cluster with no entry yet is treated as
 * `loading` by consumers, and each response fills its own slot. A scope change
 * aborts obsolete requests so a stale response cannot overwrite the new
 * selection.
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
    for (const id of ids) {
      void getClusterSummary(id, controller.signal)
        .then((detail) => {
          if (controller.signal.aborted) return;
          setSummaries((prev) => ({ ...prev, [id]: toClusterSummaryView(detail) }));
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted || isAbortError(cause)) return;
          setSummaries((prev) => ({ ...prev, [id]: UNAVAILABLE }));
        });
    }
    return () => controller.abort();
  }, [key]);
  return summaries;
}
