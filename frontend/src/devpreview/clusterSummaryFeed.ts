import { useState } from "react";

import { getFleetSummary } from "../api/fleet";
import type { FleetClusterSummary } from "../api/schemas";
import { useBoundedPoll } from "./useBoundedPoll";

// 실시간 cadence: 화면이 보일 때만 워크스페이스 fleet rollup 한 건을 재조회한다.
// bounded(초 단위)이며 60Hz가 아니고, 백그라운드 탭에서는 요청하지 않는다.
const SUMMARY_REFRESH_MS = 20_000;

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
  const ids = key ? key.split(" ") : [];
  // 공통 bounded-poll: 화면이 보일 때만 fleet rollup 한 건을 조회한다. in-flight
  // dedupe·backpressure로 중복 요청 0, 스코프 변경 시 abort로 stale overwrite 0.
  // 재조회 중 직전 요약 값은 유지하고 한 번의 setSummaries로 전체를 commit한다.
  useBoundedPoll({
    scopeKey: key,
    intervalMs: SUMMARY_REFRESH_MS,
    load: (signal) => getFleetSummary(signal),
    onResult: (fleet) => {
      const byId = new Map(fleet.clusters.map((item) => [item.cluster_id, item]));
      setSummaries(Object.fromEntries(ids.map((id) => {
        const item = byId.get(id);
        return [id, item === undefined ? UNAVAILABLE : toClusterSummaryView(item)];
      })));
    },
    // 최초 실패만 unavailable로 표시하고, 이후 실패는 직전 정상 값을 유지한다.
    onError: () => setSummaries((previous) => Object.fromEntries(
      ids.map((id) => [id, previous[id] ?? UNAVAILABLE]),
    )),
  });
  return summaries;
}
