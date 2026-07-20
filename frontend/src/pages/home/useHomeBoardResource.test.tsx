// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useHomeBoardResource } from "./useHomeBoardResource";

describe("useHomeBoardResource refresh continuity", () => {
  it("keeps the last successful data mounted while a new request is pending", async () => {
    const owner = {};
    const first = deferred<number>();
    const second = deferred<number>();
    const load = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { rerender, result } = renderHook(
      ({ requestKey }) => useHomeBoardResource(
        load,
        { key: requestKey, owner },
      ),
      { initialProps: { requestKey: "first" } },
    );

    await act(async () => {
      first.resolve(7);
      await first.promise;
    });
    expect(result.current).toMatchObject({
      data: 7,
      phase: "ready",
      refreshFailed: false,
      refreshing: false,
    });

    rerender({ requestKey: "second" });
    await act(async () => Promise.resolve());
    expect(result.current).toMatchObject({
      data: 7,
      phase: "ready",
      refreshFailed: false,
      refreshing: true,
    });

    await act(async () => {
      second.resolve(8);
      await second.promise;
    });
    expect(result.current).toMatchObject({
      data: 8,
      phase: "ready",
      refreshFailed: false,
      refreshing: false,
    });
  });

  it("keeps the last successful data when a background refresh fails", async () => {
    const owner = {};
    const first = deferred<number>();
    const second = deferred<number>();
    const load = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { rerender, result } = renderHook(
      ({ requestKey }) => useHomeBoardResource(
        load,
        { key: requestKey, owner },
      ),
      { initialProps: { requestKey: "first" } },
    );

    await act(async () => {
      first.resolve(7);
      await first.promise;
    });
    rerender({ requestKey: "second" });
    await act(async () => Promise.resolve());
    await act(async () => {
      const rejected = second.promise.catch(() => undefined);
      second.reject(new Error("refresh failed"));
      await rejected;
    });

    expect(result.current).toMatchObject({
      data: 7,
      phase: "ready",
      refreshFailed: true,
      refreshing: false,
    });
  });

  it("coalesces the StrictMode setup-cleanup-setup cycle into one request", async () => {
    const owner = {};
    const pending = deferred<number>();
    const load = vi.fn(() => pending.promise);
    const { result } = renderHook(
      () => useHomeBoardResource(load, { key: "stable", owner }),
      { wrapper: StrictModeBoundary },
    );

    await act(async () => Promise.resolve());
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(7);
      await pending.promise;
    });
    expect(result.current).toMatchObject({ data: 7, phase: "ready" });
  });
});

function StrictModeBoundary({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
