import { useEffect, useState } from "react";

// 홈 스냅샷 커밋 SSE(`/api/clusters/{id}/home/events`) 구독 — 갱신 "가속" 전용.
//
// 설계 원칙(오류 0):
//  - 이 훅은 데이터를 나르지 않는다. 스냅샷 커밋(deferred_ready)이 관측되면 tick 만
//    올리고, 화면 데이터는 기존 bounded-poll 경로가 즉시 재조회한다. 따라서 SSE 가
//    끊기거나 아예 열리지 않아도 화면은 폴링 캐던스로 계속 정상 동작한다(무해한 가속).
//  - 재접속은 EventSource 내장 동작(서버 retry: 지시)에 맡긴다. onerror 에서 상태를
//    건드리지 않는다 — 실패가 화면 상태를 오염시킬 경로 자체가 없다.
//  - 이벤트 폭주(여러 클러스터 동시 커밋)는 최소 간격으로 디바운스해 재조회를 1회로
//    합친다. 브라우저 연결 한도 보호를 위해 구독 클러스터 수도 상한을 둔다.
const MAX_EVENT_STREAMS = 8;
const MIN_TICK_GAP_MS = 1_500;

/**
 * 클러스터별 홈 SSE 를 구독해 스냅샷 커밋마다 증가하는 tick 을 돌려준다.
 * 소비자는 tick 을 폴링 scopeKey 에 섞어 "커밋 즉시 재조회"를 얻는다.
 */
export function useHomeSnapshotEvents(clusterIds: readonly string[]): number {
  const [tick, setTick] = useState(0);
  const key = Array.from(new Set(clusterIds))
    .sort()
    .slice(0, MAX_EVENT_STREAMS)
    .join(" ");

  useEffect(() => {
    if (!key || typeof EventSource === "undefined") return;
    let disposed = false;
    let lastTickAt = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const bump = () => {
      if (disposed || pending !== null) return;
      const wait = Math.max(0, lastTickAt + MIN_TICK_GAP_MS - Date.now());
      pending = setTimeout(() => {
        pending = null;
        if (disposed) return;
        lastTickAt = Date.now();
        setTick((value) => value + 1);
      }, wait);
    };

    const sources: EventSource[] = [];
    for (const clusterId of key.split(" ")) {
      try {
        const source = new EventSource(
          `/api/clusters/${encodeURIComponent(clusterId)}/home/events`,
        );
        source.addEventListener("deferred_ready", bump);
        // connected/heartbeat 는 갱신 신호가 아니다 — 구독 유지 확인용이므로 무시.
        // 오류 시 EventSource 가 서버 retry 지시대로 스스로 재접속한다.
        sources.push(source);
      } catch {
        // 생성 실패(비지원 환경 등) — 폴링만으로 동작(가속 없음, 오류 없음).
      }
    }

    return () => {
      disposed = true;
      if (pending !== null) clearTimeout(pending);
      for (const source of sources) source.close();
    };
  }, [key]);

  return tick;
}
