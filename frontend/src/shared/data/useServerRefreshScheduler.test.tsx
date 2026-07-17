// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useServerRefreshScheduler } from "./useServerRefreshScheduler";

afterEach(() => vi.useRealTimers());

describe("useServerRefreshScheduler", () => {
  it("uses a server mutation follow-up once, then restores the normal read cadence", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const rendered = renderHook(() => useServerRefreshScheduler(refresh));

    act(() => rendered.result.current.requestMutationRefresh(1.2));
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => rendered.result.current.acceptSuccess({ refreshAfterSeconds: 30 }));
    act(() => vi.advanceTimersByTime(1_199));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(2);

    act(() => rendered.result.current.acceptSuccess({ refreshAfterSeconds: 30 }));
    act(() => vi.advanceTimersByTime(29_999));
    expect(refresh).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("rejects a fabricated mutation follow-up interval", () => {
    const rendered = renderHook(() => useServerRefreshScheduler(vi.fn()));

    expect(() => rendered.result.current.requestMutationRefresh(0)).toThrow(RangeError);
  });
});
