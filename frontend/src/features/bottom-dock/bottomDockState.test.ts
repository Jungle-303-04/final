import { describe, expect, it, vi } from "vitest";

import {
  bottomDockReducer,
  INITIAL_BOTTOM_DOCK_STATE,
  MAX_DOCK_LINES,
  MAX_DOCK_TABS,
} from "./bottomDockState";
import type { LogStreamTarget } from "../log-stream/logStreamContract";

const TARGET: LogStreamTarget = {
  type: "pod",
  clusterId: "cluster-1",
  namespace: "shop",
  name: "checkout",
  container: null,
};

describe("bottom dock reducer", () => {
  it("deduplicates tabs and lines while preserving multiple targets", () => {
    let state = bottomDockReducer(INITIAL_BOTTOM_DOCK_STATE, {
      type: "open",
      id: "pod:checkout",
      target: TARGET,
    });
    state = bottomDockReducer(state, { type: "open", id: "pod:checkout", target: TARGET });
    state = bottomDockReducer(state, {
      type: "open",
      id: "pod:payment",
      target: { ...TARGET, name: "payment" },
    });
    state = bottomDockReducer(state, {
      type: "event",
      id: "pod:checkout",
      event: line("line-1"),
    });
    state = bottomDockReducer(state, {
      type: "event",
      id: "pod:checkout",
      event: line("line-1"),
    });

    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[0]?.lines).toHaveLength(1);
    expect(state.tabs[0]?.unseen).toBe(1);
  });

  it("bounds lines and records exactly how many were dropped", () => {
    let state = bottomDockReducer(INITIAL_BOTTOM_DOCK_STATE, {
      type: "open",
      id: "pod:checkout",
      target: TARGET,
    });
    for (let index = 0; index < MAX_DOCK_LINES + 3; index += 1) {
      state = bottomDockReducer(state, {
        type: "event",
        id: "pod:checkout",
        event: line(`line-${index}`),
      });
    }
    expect(state.tabs[0]?.lines).toHaveLength(MAX_DOCK_LINES);
    expect(state.tabs[0]?.lines[0]?.id).toBe("line-3");
    expect(state.tabs[0]?.dropped).toBe(3);
    expect(state.tabs[0]?.received).toBe(MAX_DOCK_LINES + 3);
  });

  it("applies a frame of events in one reducer action and deduplicates the retained buffer", () => {
    let state = bottomDockReducer(INITIAL_BOTTOM_DOCK_STATE, {
      type: "open",
      id: "pod:checkout",
      target: TARGET,
    });
    state = bottomDockReducer(state, {
      type: "events",
      batches: [{
        id: "pod:checkout",
        events: [
          { type: "connected", streamId: "stream-1" },
          line("line-1"),
          line("line-2"),
          line("line-1"),
        ],
      }],
    });

    expect(state.tabs[0]?.status).toBe("streaming");
    expect(state.tabs[0]?.lines.map((entry) => entry.id)).toEqual(["line-1", "line-2"]);
    expect(state.tabs[0]?.received).toBe(2);

    const olderEvents = Array.from({ length: 300 }, (_, index) => line(`older-${index}`));
    state = bottomDockReducer(state, {
      type: "events",
      batches: [{ id: "pod:checkout", events: olderEvents }],
    });
    state = bottomDockReducer(state, {
      type: "event",
      id: "pod:checkout",
      event: line("line-1"),
    });
    expect(state.tabs[0]?.received).toBe(302);
  });

  it("deduplicates and trims a burst with one bounded append instead of copying per line", () => {
    let state = bottomDockReducer(INITIAL_BOTTOM_DOCK_STATE, {
      type: "open",
      id: "pod:checkout",
      target: TARGET,
    });
    state = bottomDockReducer(state, {
      type: "events",
      batches: [{
        id: "pod:checkout",
        events: Array.from({ length: MAX_DOCK_LINES }, (_, index) => line(`line-${index}`)),
      }],
    });
    const retainedIds = state.tabs[0]?.recentLineIds;
    if (!retainedIds) throw new Error("expected retained line ids");
    Object.defineProperty(retainedIds, "includes", {
      configurable: true,
      value: () => {
        throw new Error("batch dedupe must use a Set");
      },
    });
    const slice = vi.spyOn(Array.prototype, "slice");

    state = bottomDockReducer(state, {
      type: "events",
      batches: [{
        id: "pod:checkout",
        events: Array.from(
          { length: MAX_DOCK_LINES + 1_000 },
          (_, index) => line(`line-${index + 1_000}`),
        ),
      }],
    });
    const sliceCalls = slice.mock.calls.length;
    slice.mockRestore();

    expect(sliceCalls).toBeLessThan(10);
    expect(state.tabs[0]?.received).toBe(MAX_DOCK_LINES * 2);
    expect(state.tabs[0]?.dropped).toBe(MAX_DOCK_LINES);
    expect(state.tabs[0]?.lines).toHaveLength(MAX_DOCK_LINES);
    expect(state.tabs[0]?.lines[0]?.id).toBe(`line-${MAX_DOCK_LINES}`);
    expect(state.tabs[0]?.lines[MAX_DOCK_LINES - 1]?.id)
      .toBe(`line-${MAX_DOCK_LINES * 2 - 1}`);
  });

  it("evicts the oldest tab at a fixed memory boundary", () => {
    let state = INITIAL_BOTTOM_DOCK_STATE;
    for (let index = 0; index < MAX_DOCK_TABS + 2; index += 1) {
      state = bottomDockReducer(state, {
        type: "open",
        id: `pod:${index}`,
        target: { ...TARGET, name: `pod-${index}` },
      });
    }
    expect(state.tabs).toHaveLength(MAX_DOCK_TABS);
    expect(state.tabs[0]?.id).toBe("pod:2");
    expect(state.activeTabId).toBe(`pod:${MAX_DOCK_TABS + 1}`);
  });

  it("tracks membership, terminal state, keyboard-step height, and next active tab", () => {
    let state = bottomDockReducer(INITIAL_BOTTOM_DOCK_STATE, {
      type: "open",
      id: "one",
      target: TARGET,
    });
    state = bottomDockReducer(state, { type: "open", id: "two", target: { ...TARGET, name: "two" } });
    state = bottomDockReducer(state, {
      type: "event",
      id: "two",
      event: { type: "pod-added", pod: "two-a" },
    });
    state = bottomDockReducer(state, {
      type: "event",
      id: "two",
      event: { type: "end", reason: "complete", diagnostic: null },
    });
    expect(state.tabs[1]).toMatchObject({
      status: "ended",
      endReason: "complete",
      pods: ["two-a"],
      retryable: false,
    });
    state = bottomDockReducer(state, { type: "resize", height: 293 });
    state = bottomDockReducer(state, { type: "close", id: "two" });

    expect(state.height).toBe(300);
    expect(state.activeTabId).toBe("one");
    expect(state.tabs).toHaveLength(1);
  });

  it("offers manual retry only for transient transport failures", () => {
    const opened = bottomDockReducer(INITIAL_BOTTOM_DOCK_STATE, {
      type: "open",
      id: "pod:checkout",
      target: TARGET,
    });
    const denied = bottomDockReducer(opened, {
      type: "failure",
      id: "pod:checkout",
      code: "forbidden",
    });
    const offline = bottomDockReducer(opened, {
      type: "failure",
      id: "pod:checkout",
      code: "offline",
    });
    expect(denied.tabs[0]?.retryable).toBe(false);
    expect(offline.tabs[0]?.retryable).toBe(true);
  });
});

function line(id: string) {
  return {
    type: "log" as const,
    id,
    observedAt: "2026-07-14T08:00:00+00:00",
    pod: "checkout",
    container: "app",
    line: id,
    lineTruncated: false,
  };
}
