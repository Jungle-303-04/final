import { useState } from "react";

import { getClusterNodesSummary } from "../api/cluster-summary";
import type { ClusterNodesSummary } from "../api/cluster-summary-schemas";
import { useBoundedPoll } from "./useBoundedPoll";

// 실시간 cadence: 화면이 보일 때만 visible cluster의 node summary를 재조회한다.
// bounded(초 단위)이며 60Hz가 아니고, 백그라운드 탭에서는 요청하지 않는다.
const SUMMARY_REFRESH_MS = 20_000;

// UI-PHASE2-001 §5.2: a typed live adapter for the Home/cluster cards. Node
// readiness and usage come from each cluster's canonical node-summary contract.
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
  openIncidents: number | null;
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
  const key = Array.from(new Set(clusterIds)).sort().join("\u0000");
  const ids = key ? key.split("\u0000") : [];
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
  return summaries;
}

function isAbortError(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "name" in cause
    && (cause as { name?: unknown }).name === "AbortError";
}
