// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyUnifiedFilterState } from "../../features/filters/filterContract";
import type {
  ChangeTimelineOptions,
  ChangeTimelinePort,
} from "../../features/resources/changeTimelineContract";
import { watchChangeTimelineInvalidations } from "../../features/resources/changeTimelineInvalidation";
import { ResourcesPortFailure } from "../../features/resources/resourcesContract";
import { useChangeTimelineDataFrame } from "./useChangeTimelineDataFrame";

vi.mock("../../features/resources/changeTimelineInvalidation", () => ({
  watchChangeTimelineInvalidations: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useChangeTimelineDataFrame freshness", () => {
  it("uses the server cadence and keeps the last success after a background failure", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const port = changeTimelinePort();
    const filterState = boundedFilter();
    const reportUnauthorized = vi.fn();
    vi.mocked(port.loadChangeTimeline)
      .mockResolvedValueOnce(snapshot({ refreshAfterSeconds: 2 }))
      .mockRejectedValueOnce(new ResourcesPortFailure("offline"));

    const rendered = renderHook(() => useChangeTimelineDataFrame({
      active: true,
      authorityKey: "workspace-a:user-a",
      filterState,
      port,
      range: "1h",
      reportUnauthorized,
      revision: 0,
      workspaceId: "workspace-a",
    }));
    await flushPromises();
    expect(vi.mocked(port.loadChangeTimeline).mock.calls.map((call) => call[2]?.aborted))
      .toEqual([false]);
    expect(rendered.result.current).toMatchObject({ phase: "ready", refreshing: false });

    act(() => vi.advanceTimersByTime(1_999));
    await flushPromises();
    expect(port.loadChangeTimeline).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(1));
    await flushPromises();
    expect(port.loadChangeTimeline).toHaveBeenCalledTimes(2);
    const firstWindow = vi.mocked(port.loadChangeTimeline).mock.calls[0]?.[1];
    const secondWindow = vi.mocked(port.loadChangeTimeline).mock.calls[1]?.[1];
    expect(firstWindow).toBeDefined();
    expect(secondWindow).toBeDefined();
    expect(secondWindow!.toMs).toBeGreaterThan(firstWindow!.toMs);
    expect(secondWindow!.toMs - secondWindow!.fromMs)
      .toBe(firstWindow!.toMs - firstWindow!.fromMs);
    expect(rendered.result.current).toMatchObject({
      phase: "ready",
      data: { events: [{ id: "change-1" }] },
      refreshFailure: { code: "offline" },
      refreshing: false,
    });
  });

  it("pauses the server cadence while hidden and refreshes once after visibility returns", async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const port = changeTimelinePort();
    const filterState = boundedFilter();
    const reportUnauthorized = vi.fn();
    const rendered = renderHook(() => useChangeTimelineDataFrame({
      active: true,
      authorityKey: "workspace-a:user-a",
      filterState,
      port,
      range: "1h",
      reportUnauthorized,
      revision: 0,
      workspaceId: "workspace-a",
    }));
    await flushPromises();
    expect(rendered.result.current.phase).toBe("ready");

    act(() => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(10_000);
    });
    await flushPromises();
    expect(vi.mocked(port.loadChangeTimeline).mock.calls.map((call) => call[2]?.aborted))
      .toEqual([false]);

    act(() => {
      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushPromises();
    expect(port.loadChangeTimeline).toHaveBeenCalledTimes(2);
  });

  it("uses an admitted Timeline change event as an immediate invalidation signal", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const port = changeTimelinePort();
    vi.mocked(watchChangeTimelineInvalidations).mockImplementationOnce(async (input) => {
      input.onInvalidate();
    });
    const timelinePort = {
      readCapabilities: vi.fn(),
      readTimeline: vi.fn(),
      subscribeTimeline: vi.fn(),
    };
    const filterState = boundedFilter();
    const reportUnauthorized = vi.fn();
    const onResourceInvalidation = vi.fn();
    renderHook(() => useChangeTimelineDataFrame({
      active: true,
      authorityKey: "workspace-a:user-a",
      filterState,
      onResourceInvalidation,
      port,
      range: "1h" as const,
      reportUnauthorized,
      revision: 0,
      timelinePort,
      workspaceId: "workspace-a",
    }));
    await flushPromises();
    expect(port.loadChangeTimeline).toHaveBeenCalledTimes(2);
    expect(onResourceInvalidation).toHaveBeenCalledTimes(1);
  });
});

function boundedFilter() {
  const state = createEmptyUnifiedFilterState();
  state.common.clusters = ["cluster-1"];
  state.resources.types = ["pod"];
  return state;
}

function changeTimelinePort(): ChangeTimelinePort {
  return {
    loadChangeTimeline: vi.fn().mockImplementation((_state, options) => (
      Promise.resolve(snapshot({}, options))
    )),
  };
}

function snapshot(
  policy: { refreshAfterSeconds?: number; eventInvalidation?: boolean } = {},
  options: ChangeTimelineOptions = { fromMs: 1_000, toMs: 3_000, bucketMs: 1_000 },
) {
  return {
    ...options,
    buckets: [{ startMs: options.fromMs, endMs: options.toMs, total: 1, warnings: 0 }],
    events: [{
      id: "change-1",
      kind: "inventory_event" as const,
      occurredMs: options.fromMs,
      title: "Pod changed",
      severity: "info" as const,
    }],
    gaps: [],
    freshnessPolicy: {
      staleAfterSeconds: 5,
      refreshAfterSeconds: policy.refreshAfterSeconds ?? 15,
      keepLastSuccess: true as const,
      pauseWhenHidden: true as const,
      eventInvalidation: policy.eventInvalidation ?? true,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    },
  };
}

async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}
