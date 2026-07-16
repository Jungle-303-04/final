// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PortForwardSessionPort,
  PortForwardSessionSnapshot,
} from "./portForwardSessionContract";
import { usePortForwardSessions } from "./usePortForwardSessions";

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("usePortForwardSessions", () => {
  it("uses the server 10-second cadence, pauses while hidden, and retains last success", async () => {
    vi.useFakeTimers();
    const port = sessionPort();
    const rendered = renderHook(() => usePortForwardSessions(port));
    await flush();

    expect(port.list).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(port.list).toHaveBeenCalledTimes(1);

    port.list.mockRejectedValueOnce(new Error("native registry unavailable"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(port.list).toHaveBeenCalledTimes(2);
    expect(rendered.result.current.frame).toMatchObject({
      phase: "ready",
      data: { sessions: [{ id: "session-a" }] },
      refreshFailure: { message: "native registry unavailable" },
    });
    rendered.unmount();
  });

  it("refreshes immediately after stop and follows up at the server-owned 500ms delay", async () => {
    vi.useFakeTimers();
    const port = sessionPort();
    const rendered = renderHook(() => usePortForwardSessions(port));
    await flush();

    await act(async () => rendered.result.current.stop("session-a"));
    await flush();
    expect(port.stop).toHaveBeenCalledWith("session-a", expect.any(AbortSignal));
    expect(port.list).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTime(499));
    expect(port.list).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(1));
    expect(port.list).toHaveBeenCalledTimes(3);
    rendered.unmount();
  });

  it("reuses the mutation refresh policy after an external native start receipt", async () => {
    vi.useFakeTimers();
    const port = sessionPort();
    const rendered = renderHook(() => usePortForwardSessions(port));
    await flush();

    act(() => rendered.result.current.refreshAfterMutation());
    await flush();
    expect(port.list).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTime(500));
    expect(port.list).toHaveBeenCalledTimes(3);
    rendered.unmount();
  });
});

function sessionPort(): PortForwardSessionPort & {
  list: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  return {
    available: true,
    list: vi.fn().mockResolvedValue(snapshot()),
    start: vi.fn().mockResolvedValue({
      sessionId: "00000000-0000-4000-8000-000000000001",
      generation: 1,
      localPort: 18_080,
      startedAt: "2026-07-17T03:00:00Z",
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    recreate: vi.fn().mockResolvedValue({
      sessionId: "00000000-0000-4000-8000-000000000002",
      generation: 2,
      localPort: 18_080,
      startedAt: "2026-07-17T03:01:00Z",
    }),
  };
}

function snapshot(): PortForwardSessionSnapshot {
  return {
    sessions: [{
      id: "session-a",
      workspaceId: "workspace-a",
      clusterId: "cluster-a",
      freshness: "live",
      namespace: "shop",
      resourceKind: "Service",
      resourceName: "checkout",
      resourceUid: "uid-service-1",
      podName: null,
      podPort: 8080,
      localPort: 18080,
      listenAddress: "127.0.0.1",
      serviceName: "checkout",
      servicePort: 80,
      scheme: "http",
      startedAt: "2026-07-17T03:00:00Z",
      status: "running",
      error: null,
      exitCode: null,
    }],
    refreshPolicy: {
      staleAfterSeconds: null,
      refreshAfterSeconds: 10,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: 0.5,
    },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
