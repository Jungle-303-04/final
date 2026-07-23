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
//  - hidden 탭에서는 스트림을 닫는다(백그라운드 연결 0). 복귀 시 즉시 다시 연다.
//  - live: 채널 건강 신호. 서버 heartbeat(기본 30s, 최대 60s)를 두 번 연속 놓치면
//    죽은 것으로 본다. 소비자는 live 일 때 폴링을 늦춰(안전망 비용 절감) SSE 에
//    갱신을 맡기고, live 가 꺼지면 빠른 폴링으로 자동 복귀한다.
const MAX_EVENT_STREAMS = 8;
const MIN_TICK_GAP_MS = 1_500;
const LIVE_WINDOW_MS = 75_000;
const LIVE_CHECK_MS = 10_000;

export interface HomeSnapshotEventsView {
  /** 스냅샷 커밋마다 증가 — 소비자는 폴링 scopeKey 에 섞어 즉시 재조회를 얻는다. */
  tick: number;
  /** SSE 채널이 살아있는지(최근 활동 관측). 폴링 캐던스 완화 판단에만 쓴다. */
  live: boolean;
}

/**
 * 클러스터별 홈 SSE 를 구독해 스냅샷 커밋 tick 과 채널 건강(live)을 돌려준다.
 * 실패는 어떤 화면 상태도 오염시키지 않는다 — 최악의 경우 "가속 없음"일 뿐이다.
 */
export function useHomeSnapshotEvents(clusterIds: readonly string[]): HomeSnapshotEventsView {
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(false);
  const key = Array.from(new Set(clusterIds))
    .sort()
    .slice(0, MAX_EVENT_STREAMS)
    .join(" ");

  useEffect(() => {
    if (!key || typeof EventSource === "undefined") return;
    let disposed = false;
    let lastTickAt = 0;
    let lastActivityAt = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let sources: EventSource[] = [];

    const markActivity = () => {
      lastActivityAt = Date.now();
      // 같은 값 재설정은 React 가 렌더를 생략하므로 heartbeat 마다 호출해도 무해하다.
      setLive(true);
    };

    const bump = () => {
      markActivity();
      if (disposed || pending !== null) return;
      const wait = Math.max(0, lastTickAt + MIN_TICK_GAP_MS - Date.now());
      pending = setTimeout(() => {
        pending = null;
        if (disposed) return;
        lastTickAt = Date.now();
        setTick((value) => value + 1);
      }, wait);
    };

    const close = () => {
      for (const source of sources) source.close();
      sources = [];
    };

    const open = () => {
      if (disposed || sources.length > 0) return;
      for (const clusterId of key.split(" ")) {
        try {
          const source = new EventSource(
            `/api/clusters/${encodeURIComponent(clusterId)}/home/events`,
          );
          source.addEventListener("deferred_ready", bump);
          // connected/heartbeat 는 갱신 신호가 아니라 채널 생존 증거로만 쓴다.
          source.addEventListener("connected", markActivity);
          source.addEventListener("heartbeat", markActivity);
          // 오류 시 EventSource 가 서버 retry 지시대로 스스로 재접속한다.
          sources.push(source);
        } catch {
          // 생성 실패(비지원 환경 등) — 폴링만으로 동작(가속 없음, 오류 없음).
        }
      }
    };

    const onVisibility = () => {
      if (document.hidden) close();
      else open();
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) open();

    // 건강 판정은 이벤트가 "안 오는" 상태를 감지해야 하므로 타이머로 확인한다.
    const liveTimer = setInterval(() => {
      if (disposed) return;
      setLive(sources.length > 0 && Date.now() - lastActivityAt < LIVE_WINDOW_MS);
    }, LIVE_CHECK_MS);

    return () => {
      disposed = true;
      clearInterval(liveTimer);
      if (pending !== null) clearTimeout(pending);
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [key]);

  return { tick, live };
}
