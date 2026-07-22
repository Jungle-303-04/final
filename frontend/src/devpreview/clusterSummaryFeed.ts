import { useMemo, useState } from "react";

import { getClusterNodesSummary } from "../api/cluster-summary";
import type { ClusterNodesSummary } from "../api/cluster-summary-schemas";
import { useDevpreviewContracts } from "./contracts";
import { useLiveStreamView, type LiveStreamViewState } from "./liveStreamFeed";
import { useBoundedPoll } from "./useBoundedPoll";

// 실시간 cadence: 화면이 보일 때만 visible cluster의 node summary를 재조회한다.
// bounded(초 단위)이며 60Hz가 아니고, 백그라운드 탭에서는 요청하지 않는다.
// 1초 주기 — 카드 수치가 관측 도착 즉시 반영되고, 표시 계층의 0.5초 보간
// (useSmoothedValue)과 맞물려 스텝 점프 없이 움직인다. in-flight dedupe 가
// 있어 응답이 1초보다 느려도 요청이 중첩되지 않는다.
const SUMMARY_REFRESH_MS = 1_000;

// UI-PHASE2-001 §5.2: a typed live adapter for the Home/cluster cards. Node
// readiness and usage come from each cluster's canonical node-summary contract.
// Missing CPU/MEM (`cpu_pct`/`mem_pct` null) stays null — an honest "not
// observed" — and is never backfilled with a generated value.

export type ClusterSummaryStatus = "loading" | "ready" | "unavailable";

export interface ClusterNodeSummaryView {
  name: string;
  ready: boolean;
  health: string;
  cpuPct: number | null;
  memPct: number | null;
  podsRunning: number;
  podsCapacity: number;
  restartsRecent: number;
  conditions: string[];
}

export interface ClusterSummaryView {
  status: ClusterSummaryStatus;
  health: string | null;
  cpuPct: number | null;
  memPct: number | null;
  podsRunning: number | null;
  podsTotal: number | null;
  nodesReady: number | null;
  nodesTotal: number | null;
  openIncidents: number | null;
  nodes: ClusterNodeSummaryView[];
  /** Live transport freshness; last-known-good values remain visible when true. */
  stale?: boolean;
  /** Real restart change reported by the latest live summary window. */
  restartDelta?: number | null;
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
  openIncidents: null,
  nodes: [],
};

export function toClusterSummaryView(detail: ClusterNodesSummary): ClusterSummaryView {
  return {
    status: "ready",
    health: null,
    cpuPct: observedMean(detail.nodes.map((node) => node.cpu_pct)),
    memPct: observedMean(detail.nodes.map((node) => node.mem_pct)),
    podsRunning: detail.nodes.reduce((total, node) => total + node.pods_running, 0),
    // Node summary exposes running pods and capacity, not a cluster-wide current
    // pod total. Keep the absent fact null instead of substituting capacity.
    podsTotal: null,
    nodesReady: detail.nodes.filter((node) => node.ready).length,
    nodesTotal: detail.nodes.length,
    openIncidents: null,
    nodes: detail.nodes.map((node) => ({
      name: node.name,
      ready: node.ready,
      health: node.health,
      cpuPct: node.cpu_pct,
      memPct: node.mem_pct,
      podsRunning: node.pods_running,
      podsCapacity: node.pods_capacity,
      restartsRecent: node.restarts_recent,
      conditions: node.conditions,
    })),
  };
}

function observedMean(values: readonly (number | null)[]): number | null {
  const observed = values.filter((value): value is number => value !== null);
  if (observed.length === 0) return null;
  const mean = observed.reduce((total, value) => total + value, 0) / observed.length;
  return Math.round(mean * 10) / 10;
}

/**
 * Reads the canonical node-summary contract for every visible card. Independent
 * requests start together (no waterfall), share one abort scope, and keep their
 * previous values while bounded polling refreshes them.
 */
export function useClusterSummaries(
  clusterIds: readonly string[],
): Record<string, ClusterSummaryView> {
  const [summaries, setSummaries] = useState<Record<string, ClusterSummaryView>>({});
  const { workspaceId } = useDevpreviewContracts();
  const key = Array.from(new Set(clusterIds)).sort().join("\u0000");
  const ids = useMemo(() => key ? key.split("\u0000") : [], [key]);
  const liveSubscription = useMemo(() => {
    // The authenticated browser contract requires one exact cluster and the
    // performance budget permits one active socket. Multi-cluster overview
    // cards therefore retain bounded REST polling; the selected dashboard/drill
    // receives the 1 Hz direct model.
    if (workspaceId === null || ids.length !== 1) return null;
    return { workspaceId, clusterId: ids[0] };
  }, [ids, workspaceId]);
  const live = useLiveStreamView(liveSubscription);
  // 공통 bounded-poll: 화면이 보일 때만 visible cluster의 노드 요약을 병렬 조회한다.
  // in-flight dedupe·backpressure로 중복 요청 0, 스코프 변경 시 abort로 stale overwrite 0.
  // 재조회 중 직전 요약 값은 유지하고 한 번의 setSummaries로 전체를 commit한다.
  useBoundedPoll({
    scopeKey: key,
    intervalMs: SUMMARY_REFRESH_MS,
    load: (signal) => Promise.all(ids.map(async (id) => {
      try {
        const detail = await getClusterNodesSummary(id, signal);
        return [id, toClusterSummaryView(detail)] as const;
      } catch (cause: unknown) {
        if (signal.aborted || isAbortError(cause)) throw cause;
        return [id, UNAVAILABLE] as const;
      }
    })),
    onResult: (entries) => setSummaries(Object.fromEntries(entries)),
    // 최초 실패만 unavailable로 표시하고, 이후 실패는 직전 정상 값을 유지한다.
    onError: () => setSummaries((previous) => Object.fromEntries(
      ids.map((id) => [id, previous[id] ?? UNAVAILABLE]),
    )),
  });
  return useMemo(
    () => applyLiveClusterSummaries(summaries, ids, live),
    [ids, live, summaries],
  );
}

/**
 * Applies only facts present in the retained live protocol model. In
 * particular, pod request ratios are never relabelled as node CPU/MEM, and
 * pods_ready is never relabelled as pods_running.
 */
export function applyLiveClusterSummaries(
  current: Readonly<Record<string, ClusterSummaryView>>,
  clusterIds: readonly string[],
  live: LiveStreamViewState,
): Record<string, ClusterSummaryView> {
  if (!live.observed) {
    if (!live.stale) return current as Record<string, ClusterSummaryView>;
    return Object.fromEntries(Object.entries(current).map(([clusterId, summary]) => [
      clusterId,
      clusterIds.includes(clusterId) ? { ...summary, stale: true } : summary,
    ]));
  }
  const podFacts = livePodFacts(live.resources, clusterIds);
  let changed = false;
  const next = { ...current };

  for (const clusterId of clusterIds) {
    const summary = current[clusterId];
    if (summary === undefined) continue;
    const liveSummary = live.summaries[clusterId];
    // A newly connected or partially projected stream can emit a zero summary
    // before any pod identities arrive. That is not authoritative evidence that
    // the cluster is empty: replacing the REST node summary here made real
    // 22/58 and 30/58 occupancy render as 0/58. Only resource.delta pod
    // identities are precise enough to redistribute occupancy per node.
    const candidateFacts = podFacts.get(clusterId);
    // resource.delta is a retained delta set, not necessarily a complete pod
    // inventory. It is authoritative only when its identity count matches the
    // summary total from the same retained model.
    const facts = candidateFacts !== undefined
      && liveSummary !== undefined
      && candidateFacts.observed === liveSummary.pods_total
      ? candidateFacts
      : undefined;
    const nodes = facts === undefined
      ? summary.nodes
      : summary.nodes.map((node) => ({
          ...node,
          podsRunning: facts.runningByNode.get(node.name) ?? 0,
        }));
    const projected: ClusterSummaryView = {
      ...summary,
      podsRunning: facts?.running ?? summary.podsRunning,
      podsTotal: shouldRetainRestPodTotal(summary, liveSummary?.pods_total, facts)
        ? summary.podsTotal
        : liveSummary?.pods_total ?? summary.podsTotal,
      nodes,
      stale: live.stale,
      restartDelta: liveSummary?.restart_delta ?? summary.restartDelta ?? null,
    };
    next[clusterId] = projected;
    changed = true;
  }

  return changed ? next : current as Record<string, ClusterSummaryView>;
}

function shouldRetainRestPodTotal(
  summary: ClusterSummaryView,
  livePodsTotal: number | undefined,
  facts: LivePodFacts | undefined,
): boolean {
  return facts === undefined
    && livePodsTotal === 0
    && (summary.podsRunning ?? 0) > 0;
}

interface LivePodFacts {
  observed: number;
  running: number;
  runningByNode: Map<string, number>;
}

function livePodFacts(
  resources: Readonly<Record<string, unknown>>,
  clusterIds: readonly string[],
): Map<string, LivePodFacts> {
  const wanted = new Set(clusterIds);
  const result = new Map<string, LivePodFacts>();
  for (const [key, value] of Object.entries(resources)) {
    const identity = livePodIdentity(key);
    if (identity === null || !wanted.has(identity.clusterId) || !isRecord(value)) continue;
    let facts = result.get(identity.clusterId);
    if (facts === undefined) {
      facts = { observed: 0, running: 0, runningByNode: new Map() };
      result.set(identity.clusterId, facts);
    }
    facts.observed += 1;
    if (typeof value.phase !== "string" || value.phase.toLowerCase() !== "running") continue;
    facts.running += 1;
    if (typeof value.node === "string" && value.node !== "") {
      facts.runningByNode.set(value.node, (facts.runningByNode.get(value.node) ?? 0) + 1);
    }
  }
  return result;
}

function livePodIdentity(key: string): { clusterId: string } | null {
  const segments = key.split("/");
  if (segments.length !== 4 || segments[2]?.toLowerCase() !== "pod") return null;
  const clusterId = segments[0];
  return clusterId ? { clusterId } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "name" in cause
    && (cause as { name?: unknown }).name === "AbortError";
}
