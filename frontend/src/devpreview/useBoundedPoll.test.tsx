// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBoundedPoll } from "./useBoundedPoll";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useBoundedPoll", () => {
  beforeEach(() => { vi.useFakeTimers(); setHidden(false); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  function deferredLoader() {
    const settlers: { resolve: (v: unknown) => void; reject: (e: unknown) => void; signal: AbortSignal }[] = [];
    const load = vi.fn((signal: AbortSignal) => new Promise((resolve, reject) => { settlers.push({ resolve, reject, signal }); }));
    return { load, settlers };
  }

  it("runs an initial load then re-polls once per interval, and commits once per load", async () => {
    const { load, settlers } = deferredLoader();
    const onResult = vi.fn();
    renderHook(() => useBoundedPoll({ scopeKey: "s", intervalMs: 10_000, load, onResult }));

    expect(load).toHaveBeenCalledTimes(1); // 초기 로드 1회
    await act(async () => { settlers[0].resolve("a"); });
    expect(onResult).toHaveBeenCalledTimes(1); // 단일 commit

    // 완료 후에만 다음 폴링 예약 → 인터벌 경과 시 1회 더
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => { settlers[1].resolve("b"); });
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it("does not overlap: an in-flight load blocks the next poll until it settles or times out (backpressure)", async () => {
    const { load, settlers } = deferredLoader();
    renderHook(() => useBoundedPoll({ scopeKey: "s", intervalMs: 10_000, load, onResult: () => {} }));
    expect(load).toHaveBeenCalledTimes(1);

    // 진행 중(시도 타임아웃 8s 이내)에는 인터벌이 지나도 새 요청이 없다(dedupe/backpressure).
    // v2: 8s 를 넘겨 정착하지 않는 행잉은 소유권을 잃고 재시도된다(고착 방지 계약) —
    // 여기서는 타임아웃 전(7s)에 정착시켜 중복 0 을 단언한다.
    await act(async () => { await vi.advanceTimersByTimeAsync(7_000); });
    expect(load).toHaveBeenCalledTimes(1); // overlapping 0

    // 완료되면 그 다음 인터벌에 재개.
    await act(async () => { settlers[0].resolve("a"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("issues no request while the document is hidden", async () => {
    const { load, settlers } = deferredLoader();
    renderHook(() => useBoundedPoll({ scopeKey: "s", intervalMs: 10_000, load, onResult: () => {} }));
    await act(async () => { settlers[0].resolve("a"); });
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => { setHidden(true); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(load).toHaveBeenCalledTimes(1); // hidden 동안 요청 0

    // 복귀 시 즉시 1회 재개
    await act(async () => { setHidden(false); });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("aborts the in-flight load and ignores its result when scopeKey changes (no stale overwrite)", async () => {
    const { load, settlers } = deferredLoader();
    const onResult = vi.fn();
    const { rerender } = renderHook(
      (props: { scope: string }) => useBoundedPoll({ scopeKey: props.scope, intervalMs: 10_000, load, onResult }),
      { initialProps: { scope: "a" } },
    );
    expect(load).toHaveBeenCalledTimes(1);
    const first = settlers[0];

    // 스코프 변경 → 이전 요청의 signal이 abort되고 새 스코프 로드가 시작된다.
    await act(async () => { rerender({ scope: "b" }); });
    expect(first.signal.aborted).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);

    // 이전(a) 스코프의 늦은 응답은 무시된다(stale overwrite 0).
    await act(async () => { first.resolve("stale-a"); });
    expect(onResult).not.toHaveBeenCalled();

    await act(async () => { settlers[1].resolve("fresh-b"); });
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith("fresh-b");
  });
});

describe("useBoundedPoll · v2 세대(generation) 계약 — stale 응답 무시·행잉 절단·burst 상한", () => {
  it("초기 요청이 abort 로 끊겨도 1초 재시도의 2차 200 이 실값으로 수렴한다", async () => {
    vi.useFakeTimers();
    const results: string[] = [];
    let call = 0;
    const load = vi.fn(() => {
      call += 1;
      return call === 1
        ? Promise.reject(new DOMException("aborted", "AbortError"))
        : Promise.resolve(`실값-${call}`);
    });
    renderHook(() => useBoundedPoll({
      scopeKey: "cluster-management", intervalMs: 20_000, load,
      onResult: (value) => results.push(value as string),
    }));
    await act(async () => { await Promise.resolve(); });
    expect(results).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(results).toEqual(["실값-2"]);
    vi.useRealTimers();
  });

  it("행잉 1차의 늦은 200 은 2차 결과를 덮지 못한다(이전 세대 무시)", async () => {
    vi.useFakeTimers();
    const results: string[] = [];
    let call = 0;
    let settleFirst: ((value: string) => void) | null = null;
    const load = vi.fn(() => {
      call += 1;
      if (call === 1) {
        // 신호를 무시하고 계속 pending 인 행잉 요청 — 나중에 수동으로 200 정착시킨다.
        return new Promise<string>((resolve) => { settleFirst = resolve; });
      }
      return Promise.resolve(`실값-${call}`);
    });
    renderHook(() => useBoundedPoll({
      scopeKey: "cluster-management", intervalMs: 60_000, load,
      onResult: (value) => results.push(value as string),
    }));
    await act(async () => { await Promise.resolve(); });
    // 8s 타임아웃이 소유권 회수 + 1s 재시도 → 2차가 최신 세대로 커밋.
    await act(async () => { await vi.advanceTimersByTimeAsync(9_200); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(results).toEqual(["실값-2"]);
    // 이제 1차(이전 세대)가 늦게 200 으로 정착 — 최신 결과를 덮으면 안 된다.
    await act(async () => { settleFirst?.("늦은-실값-1"); await Promise.resolve(); });
    expect(results).toEqual(["실값-2"]);
    vi.useRealTimers();
  });

  it("scope 변경 시 이전 스코프의 늦은 응답을 무시한다", async () => {
    vi.useFakeTimers();
    const results: string[] = [];
    const settlers: ((value: string) => void)[] = [];
    const load = vi.fn(() => new Promise<string>((resolve) => { settlers.push(resolve); }));
    const rendered = renderHook(({ scope }) => useBoundedPoll({
      scopeKey: scope, intervalMs: 60_000, load,
      onResult: (value) => results.push(value as string),
    }), { initialProps: { scope: "cluster-a" } });
    await act(async () => { await Promise.resolve(); });
    expect(settlers).toHaveLength(1);

    rendered.rerender({ scope: "cluster-b" });
    await act(async () => { await Promise.resolve(); });
    expect(settlers).toHaveLength(2);

    // 이전 스코프(cluster-a)의 늦은 200 — 무시돼야 한다.
    await act(async () => { settlers[0]("stale-a"); await Promise.resolve(); });
    expect(results).toEqual([]);
    // 현재 스코프(cluster-b)의 200 — 정상 커밋.
    await act(async () => { settlers[1]("fresh-b"); await Promise.resolve(); });
    expect(results).toEqual(["fresh-b"]);
    vi.useRealTimers();
  });

  it("scope 당 quick-retry burst 는 상한(3) 후 평시 캐던스로 후퇴한다", async () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    const load = vi.fn(() => Promise.reject(new Error("http 500")));
    renderHook(() => useBoundedPoll({
      scopeKey: "cluster-management", intervalMs: 60_000, load,
      onResult: () => undefined,
      onError: (error) => errors.push(error),
    }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_500); });
    expect(load).toHaveBeenCalledTimes(4); // 초기 1 + burst 3 = scope 상한
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(load).toHaveBeenCalledTimes(4); // interval(60s) 전까지 추가 시도 0
    expect(errors.length).toBe(4);
    vi.useRealTimers();
  });
});

