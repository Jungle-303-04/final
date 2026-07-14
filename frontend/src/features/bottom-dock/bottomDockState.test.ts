import { describe, expect, it } from "vitest";

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
      event: { type: "end", reason: "complete" },
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
