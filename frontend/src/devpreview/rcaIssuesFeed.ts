import { useEffect, useState } from "react";

import { listRcaIssues } from "../api/rca-issues";
import type { RcaIssueList } from "../api/schemas";

// UI-PHASE2-001 §5.2: typed live adapter for the Issue widget/surface and the
// notification bell. Reads the additive RCA Issue queue from
// `GET /api/dashboard/rca/issues`. Empty means no observed issues; a load
// failure is an honest `unavailable`, never a fabricated queue.

export type RcaFeedStatus = "loading" | "ready" | "unavailable";

export interface RcaIssueView {
  correlationId: string;
  clusterId: string | null;
  namespace: string | null;
  resourceName: string | null;
  resourceKind: string | null;
  symptom: string | null;
  status: string;
  severity: "critical" | "warning" | null;
}

export interface RcaIssuesFeed {
  status: RcaFeedStatus;
  items: RcaIssueView[];
}

type RcaIssueItem = RcaIssueList["items"][number];

export function toRcaIssueView(item: RcaIssueItem): RcaIssueView {
  return {
    correlationId: item.correlation_id,
    clusterId: item.cluster_id,
    namespace: item.incident_namespace,
    resourceName: item.incident_resource_name,
    resourceKind: item.incident_resource_kind,
    symptom: item.incident_symptom,
    status: item.status,
    severity: item.issue_severity,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

/**
 * Reads the live issue queue, optionally scoped to one cluster. A scope change
 * aborts the obsolete request so a stale response cannot overwrite the current
 * selection.
 */
export function useRcaIssues(clusterId?: string): RcaIssuesFeed {
  const [feed, setFeed] = useState<RcaIssuesFeed>({ status: "loading", items: [] });
  useEffect(() => {
    const controller = new AbortController();
    void listRcaIssues({ clusterId, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setFeed({ status: "ready", items: response.items.map(toRcaIssueView) });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setFeed({ status: "unavailable", items: [] });
      });
    return () => controller.abort();
  }, [clusterId]);
  return feed;
}
