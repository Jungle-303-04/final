// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RafStreamCoalescerRuntime } from "../shared/streaming/rafStreamCoalescer";
import {
  createBoundedRevalidator,
  createLiveStreamCoalescer,
  resetLiveStreamViewChannelsForTests,
  useLiveStreamView,
  type BoundedRevalidatorRuntime,
  type LiveDeltaMessage,
  type RealtimeClient,
  type RealtimeClientOptions,
  type RealtimeConnectionState,
  type RealtimeMessage,
} from "./liveStreamFeed";

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(message: RealtimeMessage): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  }

  disconnect(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  resetLiveStreamViewChannelsForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// 최소 fake rAF/timer runtime — 프레임 경계와 시간을 수동으로 구동한다.
class FakeRuntime implements RafStreamCoalescerRuntime {
  nowMs = 0;
  visible = true;
  private nextId = 1;
  private frame: { id: number; callback: FrameRequestCallback } | null = null;
  private readonly timers = new Map<number, { callback: () => void; dueAt: number }>();
  cancelFrame(id: number): void { if (this.frame?.id === id) this.frame = null; }
  clearTimer(id: number): void { this.timers.delete(id); }
  isVisible(): boolean { return this.visible; }
  now(): number { return this.nowMs; }
  requestFrame(callback: FrameRequestCallback): number { const id = this.nextId++; this.frame = { id, callback }; return id; }
  setTimer(callback: () => void, delayMs: number): number { const id = this.nextId++; this.timers.set(id, { callback, dueAt: this.nowMs + delayMs }); return id; }
  subscribeVisibilityChange(): () => void { return () => undefined; }
  advance(ms: number): void {
    this.nowMs += ms;
    for (const [id, timer] of [...this.timers]) { if (timer.dueAt <= this.nowMs) { this.timers.delete(id); timer.callback(); } }
  }
  fireFrame(): void { const f = this.frame; this.frame = null; if (f) { f.callback(this.nowMs); this.nowMs += 1000 / 60; } }
  drain(): void { let guard = 0; while (this.frame && guard++ < 10_000) { this.advance(1000 / 60); this.fireFrame(); } }
}

function mockConnect() {
  let onMessage: ((m: RealtimeMessage) => void) | undefined;
  let onStateChange: ((s: RealtimeConnectionState) => void) | undefined;
  const client: RealtimeClient = { connect: () => {}, close: vi.fn(), getState: () => ({ status: "connected", reconnectAttempt: 0, sequence: {} as never, error: null }) };
  const connect = (opts: RealtimeClientOptions): RealtimeClient => { onMessage = opts.onMessage; onStateChange = opts.onStateChange; return client; };
  return { connect, fire: (m: RealtimeMessage) => onMessage?.(m), state: (s: RealtimeConnectionState) => onStateChange?.(s), client };
}

const HELLO = { type: "hello", protocol: "realtime.v1", stream_policy: { revision: 1, max_frames_per_second: 60, hidden_tab: "coalesce", max_pending_messages: 100_000 } } as RealtimeMessage;
const delta = (seq: number): RealtimeMessage => ({ type: "resource.delta", seq, op: "replace", key: `k${seq}`, value: { seq } } as unknown as RealtimeMessage);
const snapshot = (seq: number): RealtimeMessage => ({ type: "snapshot", seq, state: { baseline: seq } } as unknown as RealtimeMessage);

const sub = { workspaceId: "default" } as never;

describe("createLiveStreamCoalescer", () => {
  it("coalesces a 1000-frame burst to ≤1 commit per animation frame, order preserved, dedupe by seq", () => {
    const runtime = new FakeRuntime();
    const io = mockConnect();
    const batches: LiveDeltaMessage[][] = [];
    const handle = createLiveStreamCoalescer({
      subscription: sub,
      onSnapshot: () => {},
      onBatch: (deltas) => batches.push([...deltas]),
      connect: io.connect,
      runtime,
      isHidden: () => !runtime.visible,
      subscribeVisibility: () => () => undefined,
    });
    handle.start();
    io.fire(HELLO);
    io.fire(snapshot(0));

    // burst: 단조 증가 seq 1..1000 + 연속 중복(같은 seq 재전송) — 한 프레임 안에 enqueue
    for (let seq = 1; seq <= 1000; seq++) {
      io.fire(delta(seq));
      if (seq === 250 || seq === 500 || seq === 1000) io.fire(delta(seq)); // 연속 중복 3건
    }
    expect(batches).toHaveLength(0); // 프레임 전에는 visible commit 0

    runtime.drain(); // 프레임 진행

    // 프레임당 최대 1 commit → batch 수는 프레임 수 이하(1000개 개별 commit 아님)
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.length).toBeLessThanOrEqual(3); // 60fps budget으로도 소수 프레임
    const seqs = batches.flat().map((m) => m.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b)); // 순서 보존(단조 증가)
    expect(new Set(seqs).size).toBe(seqs.length); // dedupe: 중복 seq 없음
    expect(seqs).toContain(1); expect(seqs).toContain(1000);
    expect(seqs.length).toBe(1000); // 연속 중복 3건 제거
    handle.stop();
  });

  it("applies snapshot as baseline and keeps receiving deltas after it", () => {
    const runtime = new FakeRuntime();
    const io = mockConnect();
    const snaps: number[] = [];
    const batches: number[] = [];
    const handle = createLiveStreamCoalescer({
      subscription: sub,
      onSnapshot: (_state, seq) => snaps.push(seq),
      onBatch: (deltas) => { for (const d of deltas) batches.push(d.seq); },
      connect: io.connect, runtime, isHidden: () => !runtime.visible, subscribeVisibility: () => () => undefined,
    });
    handle.start();
    io.fire(HELLO);
    io.fire(delta(1)); // snapshot 전 델타 — baseline이 대체
    io.fire(snapshot(5));
    io.fire(delta(6)); io.fire(delta(7));
    runtime.drain();
    expect(snaps).toEqual([5]);
    expect(batches).not.toContain(1); // snapshot이 이전 pending 델타를 대체
    expect(batches).toEqual([6, 7]);
    handle.stop();
  });

  it("flushes pending durable deltas on stop (terminal)", () => {
    const runtime = new FakeRuntime();
    const io = mockConnect();
    const batches: number[] = [];
    const handle = createLiveStreamCoalescer({
      subscription: sub, onSnapshot: () => {}, onBatch: (d) => { for (const m of d) batches.push(m.seq); },
      connect: io.connect, runtime, isHidden: () => !runtime.visible, subscribeVisibility: () => () => undefined,
    });
    handle.start();
    io.fire(HELLO); io.fire(snapshot(0));
    io.fire(delta(1)); io.fire(delta(2)); // 프레임 전 pending
    handle.stop(); // terminal flush
    expect(batches).toEqual([1, 2]);
  });

  it("bounds REST revalidation: a 1000-request burst emits leading+trailing only (not 1000)", () => {
    let nowMs = 0;
    let hidden = false;
    const timers: { id: number; cb: () => void; dueAt: number }[] = [];
    let nextId = 1;
    const runtime: BoundedRevalidatorRuntime = {
      now: () => nowMs,
      setTimer: (cb, ms) => { const id = nextId++; timers.push({ id, cb, dueAt: nowMs + ms }); return id as unknown as ReturnType<typeof setTimeout>; },
      clearTimer: (id) => { const i = timers.findIndex((t) => (t.id as unknown) === id); if (i >= 0) timers.splice(i, 1); },
      isHidden: () => hidden,
    };
    const fireDue = () => { for (const t of [...timers]) if (t.dueAt <= nowMs) { timers.splice(timers.indexOf(t), 1); t.cb(); } };
    const emit = vi.fn();
    const rv = createBoundedRevalidator(5000, emit, runtime);

    // 한 순간(t=0)에 1000회 request(폭주) → leading 1회만, trailing 1회 예약.
    for (let i = 0; i < 1000; i++) rv.request();
    expect(emit).toHaveBeenCalledTimes(1); // REST 상한: 1000 아님

    nowMs = 5000; fireDue(); // trailing 발화(폭주를 하나로 합침)
    expect(emit).toHaveBeenCalledTimes(2);

    // 또 한 순간에 1000회 → leading(직전 emit 이후 0ms) 없음, trailing 1회만.
    for (let i = 0; i < 1000; i++) rv.request();
    nowMs = 10_000; fireDue();
    expect(emit).toHaveBeenCalledTimes(3); // 총 2000 request → emit 3회(∝ 경과시간/interval, request 수 무관)

    // hidden 동안에는 아무리 request 폭주해도 emit 0(hidden-tab 0 보장).
    hidden = true;
    for (let i = 0; i < 1000; i++) rv.request();
    nowMs = 30_000; fireDue();
    expect(emit).toHaveBeenCalledTimes(3); // 증가 없음
    rv.dispose();
  });

  it("closes the socket on hidden (background backpressure) and reopens on visible", () => {
    const runtime = new FakeRuntime();
    const io = mockConnect();
    let hidden = false;
    let visListener: (() => void) | undefined;
    const connectSpy = vi.fn(io.connect);
    const handle = createLiveStreamCoalescer({
      subscription: sub, onSnapshot: () => {}, onBatch: () => {},
      connect: connectSpy, runtime,
      isHidden: () => hidden,
      subscribeVisibility: (l) => { visListener = l; return () => { visListener = undefined; }; },
    });
    handle.start();
    io.fire(HELLO);
    expect(connectSpy).toHaveBeenCalledTimes(1);

    hidden = true; visListener?.(); // 백그라운드
    expect(io.client.close).toHaveBeenCalledTimes(1); // WS 닫힘 → 네트워크 0

    hidden = false; visListener?.(); // 복귀 → 재연결(resync)
    expect(connectSpy).toHaveBeenCalledTimes(2);
    handle.stop();
  });
});

describe("useLiveStreamView", () => {
  it("shares one socket, applies live frames directly, and retains stale last-known-good data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const subscription = { workspaceId: "default", clusterId: "cluster-a" };
    const first = renderHook(() => useLiveStreamView(subscription));
    const second = renderHook(() => useLiveStreamView(subscription));

    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.url).toContain("cluster_id=cluster-a");

    act(() => {
      socket.open();
      socket.receive(HELLO);
      socket.receive({
        type: "snapshot",
        seq: 1,
        state: {
          clusters: {},
          resources: {
            "cluster-a/shop/pod/checkout-0": {
              phase: "Running",
              cpu_mcores: 120,
              node: "worker-a",
            },
          },
        },
      });
    });

    await waitFor(() => expect(first.result.current.status).toBe("connected"));
    expect(second.result.current.resources["cluster-a/shop/pod/checkout-0"])
      .toMatchObject({ cpu_mcores: 120 });

    act(() => {
      socket.receive({
        type: "resource.delta",
        seq: 2,
        op: "replace",
        key: "cluster-a/shop/pod/checkout-0",
        value: { phase: "Running", cpu_mcores: 240, node: "worker-a" },
      });
      socket.receive({
        type: "live.summary",
        seq: 3,
        cluster_id: "cluster-a",
        summary: {
          cluster_id: "cluster-a",
          window_ms: 1_000,
          pods_ready: 1,
          pods_total: 1,
          restart_delta: 0,
          rollout_phase: "idle",
          hot_pods: [],
        },
      });
    });

    await waitFor(() => expect(
      first.result.current.resources["cluster-a/shop/pod/checkout-0"],
    ).toMatchObject({ cpu_mcores: 240 }));
    expect(first.result.current.summaries["cluster-a"]?.pods_total).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    act(() => socket.disconnect());
    await waitFor(() => expect(first.result.current.stale).toBe(true));
    expect(first.result.current.resources["cluster-a/shop/pod/checkout-0"])
      .toMatchObject({ cpu_mcores: 240 });
    expect(second.result.current.resources["cluster-a/shop/pod/checkout-0"])
      .toMatchObject({ cpu_mcores: 240 });

    first.unmount();
    second.unmount();
  });
});
