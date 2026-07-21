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

  it("does not overlap: a slow in-flight load blocks the next poll until it settles (backpressure)", async () => {
    const { load, settlers } = deferredLoader();
    renderHook(() => useBoundedPoll({ scopeKey: "s", intervalMs: 10_000, load, onResult: () => {} }));
    expect(load).toHaveBeenCalledTimes(1);

    // 첫 로드가 아직 진행 중인데 인터벌이 여러 번 지나도 새 요청은 없다(dedupe/backpressure).
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
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
