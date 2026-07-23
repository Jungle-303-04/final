import { useMemo, useState } from "react";

import { getClusterNodesSummary } from "../api/cluster-summary";
import { getFleetSummary } from "../api/fleet";
import { isAbortError } from "../shared/data/asyncResourceState";
import { toClusterSummaryView, type ClusterSummaryView } from "./clusterSummaryFeed";
import { useHomeSnapshotEvents } from "./homeSnapshotEvents";
import { useBoundedPoll } from "./useBoundedPoll";

// Fleet 롤업은 전 클러스터를 단일 요청으로 반환한다(클러스터당 1요청 아님).
// 홈 카드는 이 단일 원장을 소비해 드릴다운과 숫자가 어긋나지 않게 한다.
// 기본 5초 — 서버 집계는 LATERAL 최신-snapshot 프로브라 요청당 수 ms 수준이다.
// SSE 채널이 건강하면(스냅샷 커밋이 즉시 tick 으로 옴) 폴링은 안전망으로만 남아
// 15초로 완화한다. 채널이 죽으면 5초로 자동 복귀한다.
const FLEET_REFRESH_MS = 5_000;
const FLEET_REFRESH_SSE_LIVE_MS = 15_000;

/**
 * Reads the server-computed fleet rollup and exposes it in the existing
 * ClusterSummaryView shape so the compact home cards render without change.
 *
 * 회복 규칙(빈 화면 금지):
 *  - fleet 응답 실패 시 클러스터별 nodes/summary 계약으로 폴백해 같은 화면 값을
 *    채운다(집계 API 장애가 카드 전체를 비우지 않는다).
 *  - 폴백까지 실패하면 에러를 던져(onError) 직전 정상 값을 그대로 유지한다 —
 *    성공 응답만 화면 상태를 교체할 수 있다(last-known-good).
 *
 * fleet does not carry per-node detail (slots) or namespace counts; those stay
 * null here and the card falls back to the values it already sources elsewhere
 * (cl.namespaceCount). Node/slot detail remains the per-cluster drill's job.
 */
export function useFleetSummaries(
  clusterIds: readonly string[],
): Record<string, ClusterSummaryView> {
  const [summaries, setSummaries] = useState<Record<string, ClusterSummaryView>>({});
  const key = Array.from(new Set(clusterIds)).sort().join(" ");
  // load 는 useBoundedPoll 이 매 렌더 ref 로 고정하므로 최신 ids 클로저를 안전하게 쓴다.
  const ids = useMemo(() => (key ? key.split(" ") : []), [key]);
  // 실시간: 스냅샷 커밋 SSE(tick)가 오르면 scopeKey 가 바뀌어 bounded-poll 이 즉시
  // 재조회한다(관측 도착 즉시 반영). SSE 가 없거나 끊겨도 폴링 캐던스는 그대로 유지.
  const { tick: snapshotTick, live: sseLive } = useHomeSnapshotEvents(ids);
  const scopeKey = key ? `fleet:${snapshotTick}` : "";

  useBoundedPoll({
    scopeKey,
    intervalMs: sseLive ? FLEET_REFRESH_SSE_LIVE_MS : FLEET_REFRESH_MS,
    load: async (signal) => {
      try {
        const fleet = await getFleetSummary(signal);
        const next: Record<string, ClusterSummaryView> = {};
        for (const cluster of fleet.clusters) {
          next[cluster.cluster_id] = {
            status: "ready",
            health: cluster.health,
            cpuPct: cluster.cpu_pct,
            memPct: cluster.mem_pct,
            podsRunning: cluster.pods_running,
            podsTotal: cluster.pods_total,
            nodesReady: cluster.nodes_ready,
            nodesTotal: cluster.nodes_total,
            openIncidents: cluster.open_incidents,
            nodes: [],
            restartDelta: cluster.restarts_recent,
          };
        }
        return next;
      } catch (cause: unknown) {
        if (signal.aborted || isAbortError(cause)) throw cause;
        // fleet 집계 장애 → 클러스터별 canonical nodes/summary 로 동일 값을 채운다.
        const entries = await Promise.all(ids.map(async (id) => {
          try {
            const detail = await getClusterNodesSummary(id, signal);
            return [id, toClusterSummaryView(detail)] as const;
          } catch (fallbackCause: unknown) {
            if (signal.aborted || isAbortError(fallbackCause)) throw fallbackCause;
            return null;
          }
        }));
        const recovered = entries.filter(
          (entry): entry is readonly [string, ClusterSummaryView] => entry !== null,
        );
        if (recovered.length === 0) throw cause;
        return Object.fromEntries(recovered);
      }
    },
    onResult: (next) => setSummaries(next),
    // 실패(폴백 포함 전부 실패)는 직전 정상 값을 유지한다 — 화면을 비우지 않는다.
    onError: () => setSummaries((previous) => previous),
  });

  return useMemo(() => summaries, [summaries]);
}
