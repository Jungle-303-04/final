import { describe, expect, it } from "vitest";

import { createServerRefreshScheduler } from "./serverRefreshScheduler";

describe("server refresh scheduler", () => {
  it("uses only the response-provided interval after a successful response", () => {
    const harness = schedulerHarness();
    const scheduler = createServerRefreshScheduler({
      onEligibleRefresh: harness.refresh,
      runtime: harness.runtime,
    });

    expect(harness.timerCount()).toBe(0);
    scheduler.complete({ refreshAfterSeconds: 17 });
    expect(harness.delays()).toEqual([17_000]);

    harness.fireNextTimer();
    expect(harness.refreshCount).toBe(1);
    expect(scheduler.isRefreshInFlight()).toBe(true);
    expect(harness.timerCount()).toBe(0);
  });

  it("replaces, rather than duplicates, a pending timer when a newer response changes policy", () => {
    const harness = schedulerHarness();
    const scheduler = createServerRefreshScheduler({ onEligibleRefresh: harness.refresh, runtime: harness.runtime });

    scheduler.complete({ refreshAfterSeconds: 30 });
    scheduler.complete({ refreshAfterSeconds: 9 });

    expect(harness.clearedTimers).toEqual([1]);
    expect(harness.timerCount()).toBe(1);
    expect(harness.delays()).toEqual([9_000]);
  });

  it("pauses while hidden and gives exactly one eligible refresh when visibility returns", () => {
    const harness = schedulerHarness();
    const scheduler = createServerRefreshScheduler({ onEligibleRefresh: harness.refresh, runtime: harness.runtime });

    scheduler.complete({ refreshAfterSeconds: 12 });
    harness.setVisible(false);
    expect(harness.timerCount()).toBe(0);
    expect(harness.clearedTimers).toEqual([1]);

    harness.setVisible(true);
    harness.setVisible(true);
    expect(harness.refreshCount).toBe(1);
    expect(scheduler.isRefreshInFlight()).toBe(true);
    expect(harness.timerCount()).toBe(0);
  });

  it("coalesces repeated event invalidations into one in-flight refresh", () => {
    const harness = schedulerHarness();
    const scheduler = createServerRefreshScheduler({ onEligibleRefresh: harness.refresh, runtime: harness.runtime });

    scheduler.complete({ refreshAfterSeconds: 15 });
    scheduler.invalidate();
    scheduler.invalidate();

    expect(harness.refreshCount).toBe(1);
    expect(scheduler.isRefreshInFlight()).toBe(true);
    expect(harness.timerCount()).toBe(0);
  });

  it("defers an event invalidation until a hidden tab becomes visible", () => {
    const harness = schedulerHarness();
    const scheduler = createServerRefreshScheduler({ onEligibleRefresh: harness.refresh, runtime: harness.runtime });

    scheduler.complete({ refreshAfterSeconds: 15 });
    harness.setVisible(false);
    scheduler.invalidate();
    expect(harness.refreshCount).toBe(0);

    harness.setVisible(true);
    expect(harness.refreshCount).toBe(1);
  });

  it("does not create an uncontrolled retry after a background failure", () => {
    const harness = schedulerHarness();
    const scheduler = createServerRefreshScheduler({ onEligibleRefresh: harness.refresh, runtime: harness.runtime });

    scheduler.complete({ refreshAfterSeconds: 4 });
    harness.fireNextTimer();
    scheduler.backgroundFailure();
    harness.setVisible(false);
    harness.setVisible(true);

    expect(harness.refreshCount).toBe(1);
    expect(harness.timerCount()).toBe(0);
    expect(scheduler.isRefreshInFlight()).toBe(false);
  });

  it("requires a new successful response before scheduling after a failed refresh", () => {
    const harness = schedulerHarness();
    const scheduler = createServerRefreshScheduler({ onEligibleRefresh: harness.refresh, runtime: harness.runtime });

    scheduler.complete({ refreshAfterSeconds: 4 });
    harness.fireNextTimer();
    scheduler.backgroundFailure();
    scheduler.complete({ refreshAfterSeconds: 22 });

    expect(harness.delays()).toEqual([22_000]);
    expect(harness.timerCount()).toBe(1);
  });

  it("rejects invalid server policy instead of substituting a client default", () => {
    const harness = schedulerHarness();
    const scheduler = createServerRefreshScheduler({ onEligibleRefresh: harness.refresh, runtime: harness.runtime });

    expect(() => scheduler.complete({ refreshAfterSeconds: 0 })).toThrow(RangeError);
    expect(() => scheduler.complete({ refreshAfterSeconds: Number.NaN })).toThrow(RangeError);
    expect(harness.timerCount()).toBe(0);
  });

  it("strictly stops timers and visibility work when disposed or aborted", () => {
    const harness = schedulerHarness();
    const controller = new AbortController();
    const scheduler = createServerRefreshScheduler({
      onEligibleRefresh: harness.refresh,
      runtime: harness.runtime,
      signal: controller.signal,
    });

    scheduler.complete({ refreshAfterSeconds: 8 });
    controller.abort();
    harness.setVisible(true);
    harness.fireAllTimers();

    expect(scheduler.isDisposed()).toBe(true);
    expect(scheduler.complete({ refreshAfterSeconds: 8 })).toBe(false);
    expect(harness.refreshCount).toBe(0);
    expect(harness.timerCount()).toBe(0);
  });
});

function schedulerHarness() {
  let nextTimer = 1;
  let visible = true;
  const timers = new Map<number, { callback: () => void; delayMs: number }>();
  const listeners = new Set<() => void>();
  const clearedTimers: number[] = [];
  let refreshCount = 0;
  return {
    clearedTimers,
    get refreshCount() {
      return refreshCount;
    },
    refresh() {
      refreshCount += 1;
    },
    runtime: {
      clearTimer(timer: number) {
        clearedTimers.push(timer);
        timers.delete(timer);
      },
      isVisible: () => visible,
      setTimer(callback: () => void, delayMs: number) {
        const timer = nextTimer;
        nextTimer += 1;
        timers.set(timer, { callback, delayMs });
        return timer;
      },
      subscribeVisibilityChange(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    delays: () => [...timers.values()].map(({ delayMs }) => delayMs),
    fireAllTimers() {
      for (const timer of [...timers.keys()]) this.fireTimer(timer);
    },
    fireNextTimer() {
      const timer = timers.keys().next().value;
      if (timer === undefined) throw new Error("expected a scheduled timer");
      this.fireTimer(timer);
    },
    fireTimer(timer: number) {
      const scheduled = timers.get(timer);
      if (!scheduled) return;
      timers.delete(timer);
      scheduled.callback();
    },
    setVisible(next: boolean) {
      visible = next;
      listeners.forEach((listener) => listener());
    },
    timerCount: () => timers.size,
  };
}
