import { useEffect, useState } from "react";

import { getInventorySummary } from "../api/inventory-summary";

// UI-PHASE2-001 §5.2: typed live adapter for the Home W5 namespace distribution.
// Aggregates per-namespace pod counts from each cluster's
// `GET /api/clusters/{id}/inventory/summary` (`namespaces[].counts` where
// resource_type === "pod"). A cluster whose inventory is unavailable simply
// contributes nothing — counts are never fabricated.

export type NamespacesFeedStatus = "loading" | "ready" | "unavailable";

export interface NamespacePodCount {
  namespace: string;
  podCount: number;
}

export interface InventoryNamespacesView {
  status: NamespacesFeedStatus;
  items: NamespacePodCount[];
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

export function useInventoryNamespaces(
  clusterIds: readonly string[],
): InventoryNamespacesView {
  const [view, setView] = useState<InventoryNamespacesView>({ status: "loading", items: [] });
  const key = clusterIds.join(" ");
  useEffect(() => {
    const ids = key ? key.split(" ") : [];
    if (ids.length === 0) return;
    const controller = new AbortController();
    const totals = new Map<string, number>();
    let remaining = ids.length;
    let anyReady = false;
    for (const id of ids) {
      void getInventorySummary(id, controller.signal)
        .then((summary) => {
          if (controller.signal.aborted) return;
          anyReady = true;
          for (const ns of summary.namespaces) {
            const pods = ns.counts
              .filter((count) => count.resource_type === "pod")
              .reduce((sum, count) => sum + count.count, 0);
            if (pods > 0) totals.set(ns.namespace, (totals.get(ns.namespace) ?? 0) + pods);
          }
        })
        .catch((cause: unknown) => {
          if (isAbortError(cause)) return;
          // A single cluster's unavailable inventory contributes nothing.
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          remaining -= 1;
          if (remaining === 0) {
            const items = [...totals.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([namespace, podCount]) => ({ namespace, podCount }));
            setView({ status: anyReady ? "ready" : "unavailable", items });
          }
        });
    }
    return () => controller.abort();
  }, [key]);
  return view;
}
