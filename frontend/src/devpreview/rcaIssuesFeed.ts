import { useEffect, useState } from "react";

import { listRcaIssues } from "../api/rca-issues";
import type { RcaIssueList } from "../api/schemas";
import type { DevpreviewCluster } from "./contracts";
import { useVisibleRefreshClock } from "../shared/data/useVisibleRefreshClock";
import {
  isTerminalRcaIssueStatus,
  rcaIssueIdentity,
  selectRcaIssueRepresentatives,
  type RcaIssueRepresentativeItem,
} from "./rcaIssueGrouping";

// UI-PHASE2-001 §5.2: typed live adapter for the Issue widget/surface and the
// notification bell. Reads the additive RCA Issue queue from
// `GET /api/dashboard/rca/issues`. Empty means no observed issues; a load
// failure is an honest `unavailable`, never a fabricated queue.

export type RcaFeedStatus = "loading" | "ready" | "stale" | "unavailable";

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

export type RcaIssueItem = RcaIssueList["items"][number];
export const RCA_ISSUES_REFRESH_MS = 10_000;
export { rcaIssueIdentity };

const OBSERVED_TARGET_STAGES = new Set(["agent_connected", "snapshot_received", "ready"]);

/**
 * The rehearsal queue follows live, mutable target clusters only. Management
 * infrastructure and targets that are stale, disconnecting or whose install
 * expired must not leak historical incidents into the current demo story.
 */
export function activeIncidentClusterIds(
  clusters: readonly Pick<DevpreviewCluster, "id" | "role" | "connectionStatus" | "connectionStage">[],
): string[] {
  return clusters
    .filter(isActiveIncidentCluster)
    .map((cluster) => cluster.id);
}

export function isActiveIncidentCluster(
  cluster: Pick<DevpreviewCluster, "role" | "connectionStatus" | "connectionStage">,
): boolean {
  return cluster.role === "target"
    && cluster.connectionStatus === "online"
    && cluster.connectionStage !== null
    && cluster.connectionStage !== undefined
    && OBSERVED_TARGET_STAGES.has(cluster.connectionStage);
}

export function isActiveRcaIssue(item: Pick<RcaIssueItem, "status">): boolean {
  return !isTerminalRcaIssueStatus(item.status);
}

export async function loadRcaIssueItems(
  clusterIds: readonly string[] | undefined,
  signal: AbortSignal,
): Promise<RcaIssueItem[]> {
  const candidates = await loadRcaIssueCandidates(clusterIds, signal);
  const latestByIdentity = new Map<string, { item: RcaIssueItem; index: number; updatedMs: number }>();
  candidates.forEach((item, index) => {
    const identity = rcaIssueIdentity(item);
    const updatedMs = parseUpdatedMs(item.updated_at);
    const previous = latestByIdentity.get(identity);
    if (previous === undefined || updatedMs > previous.updatedMs) {
      latestByIdentity.set(identity, { item, index, updatedMs });
    }
  });
  return [...latestByIdentity.values()]
    .sort((a, b) => b.updatedMs - a.updatedMs || a.index - b.index)
    .map(({ item }) => item);
}

export async function loadRcaIssueRepresentativeItems(
  clusterIds: readonly string[] | undefined,
  signal: AbortSignal,
): Promise<RcaIssueRepresentativeItem[]> {
  return selectRcaIssueRepresentatives(await loadRcaIssueCandidates(clusterIds, signal));
}

async function loadRcaIssueCandidates(
  clusterIds: readonly string[] | undefined,
  signal: AbortSignal,
): Promise<RcaIssueItem[]> {
  const scopedClusterIds = clusterIds === undefined
    ? null
    : [...new Set(clusterIds.filter((clusterId) => clusterId.trim() !== ""))].sort();
  const requests = scopedClusterIds === null
    ? [listRcaIssues({ limit: 100, signal })]
    : scopedClusterIds.map((clusterId) => listRcaIssues({ clusterId, limit: 100, signal }));
  const responses = await Promise.all(requests);
  const allowedClusters = scopedClusterIds === null ? null : new Set(scopedClusterIds);
  return responses
    .flatMap((response) => response.items)
    .filter((item) => allowedClusters === null || (item.cluster_id !== null && allowedClusters.has(item.cluster_id)));
}

export async function loadActiveRcaIssueItems(
  clusterIds: readonly string[] | undefined,
  signal: AbortSignal,
): Promise<RcaIssueItem[]> {
  const items = await loadRcaIssueItems(clusterIds, signal);
  // Resolve/close is applied after identity reduction: the newest terminal
  // row ends every older correlation for that same active incident.
  return items.filter(isActiveRcaIssue);
}

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
 * Reads the live issue queue, optionally scoped to live cluster identities. A
 * scope change aborts the obsolete fan-out and immediately hides its previous
 * snapshot, so history from a disconnected target cannot flash in the new UI.
 */
export function useRcaIssues(clusterIds?: readonly string[]): RcaIssuesFeed {
  const scopeKey = clusterIds === undefined
    ? null
    : [...new Set(clusterIds.filter((clusterId) => clusterId.trim() !== ""))].sort().join("\u0000");
  const [snapshot, setSnapshot] = useState<{ scopeKey: string | null; feed: RcaIssuesFeed }>({
    scopeKey,
    feed: { status: "loading", items: [] },
  });
  const { revision } = useVisibleRefreshClock(true, RCA_ISSUES_REFRESH_MS);
  useEffect(() => {
    const controller = new AbortController();
    const scopedClusterIds = scopeKey === null ? null : scopeKey === "" ? [] : scopeKey.split("\u0000");
    void loadActiveRcaIssueItems(scopedClusterIds ?? undefined, controller.signal)
      .then((loadedItems) => {
        if (controller.signal.aborted) return;
        const items = loadedItems.map(toRcaIssueView);
        setSnapshot({ scopeKey, feed: { status: "ready", items } });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setSnapshot((previous) => (
          previous.scopeKey === scopeKey
          && (previous.feed.status === "ready" || previous.feed.status === "stale")
            ? {
                scopeKey,
                feed: { status: "stale", items: previous.feed.items },
              }
            : { scopeKey, feed: { status: "unavailable", items: [] } }
        ));
      });
    return () => controller.abort();
  }, [revision, scopeKey]);
  return snapshot.scopeKey === scopeKey
    ? snapshot.feed
    : { status: "loading", items: [] };
}

function parseUpdatedMs(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}
