import { describe, expect, it } from "vitest";

import {
  createRafStreamCoalescer,
  type RafStreamCoalescerRuntime,
} from "./rafStreamCoalescer";

interface StreamEvent {
  cursor: number;
  value: string;
}

describe("createRafStreamCoalescer", () => {
  it("delivers a replay in cursor order and suppresses already-flushed duplicates", () => {
    const runtime = new FakeRuntime();
    const received: StreamEvent[][] = [];
    const coalescer = createRafStreamCoalescer<StreamEvent>({
      cursorOf: (event) => event.cursor,
      onFlush: (events) => received.push([...events]),
      policy: { hiddenTab: "coalesce", maxFramesPerSecond: 60 },
      runtime,
    });

    expect(coalescer.enqueue(event(1))).toBe("queued");
    expect(coalescer.enqueue(event(2))).toBe("queued");
    runtime.fireFrame();

    expect(coalescer.enqueue(event(1))).toBe("duplicate");
    expect(coalescer.enqueue(event(2))).toBe("duplicate");
    expect(coalescer.enqueue(event(3))).toBe("queued");
    runtime.fireFrame();

    expect(received.map((batch) => batch.map(({ cursor }) => cursor))).toEqual([
      [1, 2],
      [3],
    ]);
  });

  it("fails closed instead of reordering a not-yet-flushed cursor", () => {
    const runtime = new FakeRuntime();
    const coalescer = createRafStreamCoalescer<StreamEvent>({
      cursorOf: (event) => event.cursor,
      onFlush: () => undefined,
      policy: { hiddenTab: "coalesce", maxFramesPerSecond: 60 },
      runtime,
    });

    coalescer.enqueue(event(2));

    expect(() => coalescer.enqueue(event(1))).toThrow(
      "stream cursor regressed before a frame was flushed",
    );
  });

  it("honors the server frame budget without changing the batch order", () => {
    const runtime = new FakeRuntime();
    const received: number[][] = [];
    const coalescer = createRafStreamCoalescer<StreamEvent>({
      cursorOf: (event) => event.cursor,
      onFlush: (events) => received.push(events.map(({ cursor }) => cursor)),
      policy: { hiddenTab: "coalesce", maxFramesPerSecond: 2 },
      runtime,
    });

    coalescer.enqueue(event(1));
    runtime.fireFrame();

    runtime.advance(100);
    coalescer.enqueue(event(2));
    runtime.fireFrame();
    expect(received).toEqual([[1]]);

    runtime.advance(400);
    runtime.fireFrame();
    expect(received).toEqual([[1], [2]]);
  });

  it("coalesces while hidden and resumes on the next allowed visible frame", () => {
    const runtime = new FakeRuntime();
    runtime.visible = false;
    const received: number[][] = [];
    const coalescer = createRafStreamCoalescer<StreamEvent>({
      cursorOf: (event) => event.cursor,
      onFlush: (events) => received.push(events.map(({ cursor }) => cursor)),
      policy: { hiddenTab: "coalesce", maxFramesPerSecond: 60 },
      runtime,
    });

    coalescer.enqueue(event(1));
    coalescer.enqueue(event(2));
    expect(runtime.hasScheduledFrame()).toBe(false);

    runtime.setVisible(true);
    runtime.fireFrame();

    expect(received).toEqual([[1, 2]]);
  });

  it("disposes pending work when its abort signal ends", () => {
    const runtime = new FakeRuntime();
    const controller = new AbortController();
    const onFlush = () => {
      throw new Error("disposed coalescer must not flush");
    };
    const coalescer = createRafStreamCoalescer<StreamEvent>({
      cursorOf: (event) => event.cursor,
      onFlush,
      policy: { hiddenTab: "coalesce", maxFramesPerSecond: 60 },
      runtime,
      signal: controller.signal,
    });

    coalescer.enqueue(event(1));
    controller.abort();
    runtime.fireFrame();

    expect(coalescer.isDisposed()).toBe(true);
    expect(coalescer.enqueue(event(2))).toBe("disposed");
  });

  it("keeps semantic event order identical when a consumer requests reduced motion", () => {
    const full = flushWithMotionPreference(false);
    const reduced = flushWithMotionPreference(true);

    expect(reduced).toEqual(full);
    expect(reduced).toEqual([[1, 2, 3]]);
  });
});

function flushWithMotionPreference(reducedMotion: boolean): number[][] {
  const runtime = new FakeRuntime();
  const received: number[][] = [];
  const coalescer = createRafStreamCoalescer<StreamEvent>({
    cursorOf: (event) => event.cursor,
    onFlush: (events) => received.push(events.map(({ cursor }) => cursor)),
    policy: { hiddenTab: "coalesce", maxFramesPerSecond: 60 },
    reducedMotion,
    runtime,
  });
  coalescer.enqueue(event(1));
  coalescer.enqueue(event(2));
  coalescer.enqueue(event(3));
  runtime.fireFrame();
  return received;
}

function event(cursor: number): StreamEvent {
  return { cursor, value: `event-${cursor}` };
}

class FakeRuntime implements RafStreamCoalescerRuntime {
  nowMs = 0;
  visible = true;
  private nextId = 1;
  private frame: { id: number; callback: FrameRequestCallback } | null = null;
  private readonly timers = new Map<number, { callback: () => void; dueAt: number }>();
  private readonly visibilityListeners = new Set<() => void>();

  cancelFrame(id: number): void {
    if (this.frame?.id === id) this.frame = null;
  }

  clearTimer(id: number): void {
    this.timers.delete(id);
  }

  isVisible(): boolean {
    return this.visible;
  }

  now(): number {
    return this.nowMs;
  }

  requestFrame(callback: FrameRequestCallback): number {
    const id = this.nextId++;
    this.frame = { id, callback };
    return id;
  }

  setTimer(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.timers.set(id, { callback, dueAt: this.nowMs + delayMs });
    return id;
  }

  subscribeVisibilityChange(listener: () => void): () => void {
    this.visibilityListeners.add(listener);
    return () => this.visibilityListeners.delete(listener);
  }

  advance(milliseconds: number): void {
    this.nowMs += milliseconds;
    for (const [id, timer] of [...this.timers]) {
      if (timer.dueAt > this.nowMs) continue;
      this.timers.delete(id);
      timer.callback();
    }
  }

  fireFrame(): void {
    const frame = this.frame;
    this.frame = null;
    frame?.callback(this.nowMs);
  }

  hasScheduledFrame(): boolean {
    return this.frame !== null;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.visibilityListeners.forEach((listener) => listener());
  }
}
