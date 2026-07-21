import { useEffect, useRef } from "react";

// UI-PHASE2-METRICS-001 · 실시간 cadence · 공통 bounded-poll primitive.
// stale 허용 read를 visibility-gated bounded 폴링으로 전환하는 재사용 훅.
//
// 보장:
//  - hidden-tab 0 요청: 문서가 숨겨지면 대기 타이머를 취소하고 새 요청을 내지 않는다.
//  - in-flight dedupe/backpressure: 진행 중 요청이 있으면 새 폴링을 시작하지 않고,
//    다음 예약은 요청 완료(finally) 이후에만 한다 → 동시 중복 요청 0, 느린 백엔드에서
//    요청이 쌓이지 않는다(60Hz 방지, 무조건 20s 아님 — 호출자가 endpoint 비용에 맞춰 지정).
//  - AbortController: 스코프(scopeKey) 변경·언마운트 시 진행 중 요청을 abort → stale 스코프
//    응답이 새 스코프 상태를 덮지 않는다(scope stale overwrite 0).
//  - 복귀 즉시 재조회: 화면이 다시 보이면(visibilitychange) 진행 중이 아니면 즉시 1회.
//  - stale-while-refresh + 단일 commit: load는 성공/실패 각 1회만 콜백을 호출하고, 호출자는
//    직전 값을 유지하다 결과가 오면 교체한다(요청 중 DOM 유지 → CLS 0).
//
// load/onResult/onError는 매 렌더 새로 생성돼도 되도록 ref로 고정한다. 이펙트는
// scopeKey·intervalMs 변경 시에만 재구성된다. scopeKey === "" 이면 폴링을 하지 않는다.
export function useBoundedPoll<T>(options: {
  scopeKey: string;
  intervalMs: number;
  load: (signal: AbortSignal) => Promise<T>;
  onResult: (value: T) => void;
  onError?: (error: unknown) => void;
}): void {
  const loadRef = useRef(options.load);
  const onResultRef = useRef(options.onResult);
  const onErrorRef = useRef(options.onError);
  // 최신 콜백을 렌더 중이 아니라 커밋 후 이펙트에서 고정한다. run()은 이펙트/타이머에서만
  // ref를 읽으므로 렌더-시점 ref 쓰기(react-hooks/refs) 없이 항상 최신 콜백을 사용한다.
  useEffect(() => {
    loadRef.current = options.load;
    onResultRef.current = options.onResult;
    onErrorRef.current = options.onError;
  });

  const { scopeKey, intervalMs } = options;

  useEffect(() => {
    if (scopeKey === "" || !Number.isFinite(intervalMs) || intervalMs <= 0) return undefined;
    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 스코프 단위 abort — 스코프가 유지되는 동안의 모든 폴링을 함께 취소한다.
    const scopeController = new AbortController();

    const clearTimer = () => {
      if (timer !== null) { clearTimeout(timer); timer = null; }
    };
    const schedule = () => {
      if (timer !== null || disposed || inFlight || document.hidden) return;
      timer = setTimeout(() => { timer = null; run(); }, intervalMs);
    };
    const run = () => {
      if (inFlight || disposed || document.hidden || scopeController.signal.aborted) return;
      inFlight = true;
      loadRef.current(scopeController.signal)
        .then((value) => {
          if (disposed || scopeController.signal.aborted) return;
          onResultRef.current(value);
        })
        .catch((error: unknown) => {
          if (disposed || scopeController.signal.aborted) return;
          if (isAbortError(error)) return;
          onErrorRef.current?.(error);
        })
        .finally(() => {
          inFlight = false;
          schedule(); // 다음 폴링은 완료 후에만 예약(backpressure).
        });
    };
    const onVisibility = () => {
      if (document.hidden) { clearTimer(); return; }
      if (!inFlight) run(); // 복귀 즉시 1회(중복은 inFlight로 차단)
    };
    document.addEventListener("visibilitychange", onVisibility);
    run(); // 최초 로드

    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
      scopeController.abort();
    };
  }, [scopeKey, intervalMs]);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}
