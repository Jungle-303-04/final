// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiAssistantPort } from "../features/ai-assistant/aiAssistantContract";
import type {
  LogStreamHandlers,
  LogStreamPort,
  LogStreamTarget,
} from "../features/log-stream/logStreamContract";
import { LogStreamFailure } from "../features/log-stream/logStreamContract";
import { installMatchMedia, renderShell } from "./__tests__/ProductShellInteractionSupport";

vi.mock("react-virtuoso", async () => {
  const React = await import("react");
  return {
    Virtuoso: React.forwardRef((props: Record<string, unknown>, ref) => {
      React.useImperativeHandle(ref, () => ({ scrollToIndex: vi.fn() }));
      const data = (props.data ?? []) as Array<{ id: string }>;
      const itemContent = props.itemContent as (index: number, item: { id: string }) => React.ReactNode;
      return <div>{data.map((item, index) => (
        <React.Fragment key={item.id}>{itemContent(index, item)}</React.Fragment>
      ))}</div>;
    }),
  };
});

beforeEach(() => {
  installMatchMedia(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProductShell bottom log dock", () => {
  it("keeps multiple bounded stream tabs, resizes, collapses, and renders lines as text", async () => {
    const user = userEvent.setup();
    const stream = streamPort();
    const { container } = renderShell({
      initialEntry: "/resources?clusters=cluster-1",
      logStreamPort: stream.port,
      releasedSurfaceIds: new Set(["home", "resources"]),
    });

    await user.click(screen.getByRole("button", { name: "checkout 로그 열기" }));
    flushEventFrame(() => {
      stream.emit("checkout", { type: "connected", streamId: "stream-checkout" });
      stream.emit("checkout", {
        type: "log",
        id: "line-1",
        observedAt: "2026-07-14T08:00:00+00:00",
        pod: "checkout",
        container: "app",
        line: "<script>alert('never')</script>",
        lineTruncated: false,
      });
    });
    expect(await screen.findByRole("region", { name: "로그 독" })).toBeTruthy();
    expect((await screen.findByText("<script>alert('never')</script>")).tagName).toBe("CODE");
    expect([...container.querySelectorAll("script")].every(
      (element) => !element.textContent?.includes("alert('never')"),
    )).toBe(true);

    await user.click(screen.getByRole("button", { name: "payment 로그 열기" }));
    flushEventFrame(() => stream.emit(
      "payment",
      { type: "connected", streamId: "stream-payment" },
    ));
    expect(screen.getByRole("tab", { name: /로그: checkout/u })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /로그: payment/u })).toBeTruthy();

    const dock = container.querySelector('[data-slot="bottom-dock"]');
    fireEvent.keyDown(screen.getByRole("separator", { name: "로그 독 높이 조절" }), {
      key: "ArrowUp",
    });
    expect(dock?.getAttribute("data-height")).toBe("300");
    await user.click(screen.getByRole("button", { name: "로그 독 접기" }));
    expect(dock?.getAttribute("data-collapsed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "로그 독 펼치기" }));
    expect(dock?.getAttribute("data-collapsed")).toBeNull();
  });

  it("binds the active server-owned stream handle into an AI question without raw lines", async () => {
    const user = userEvent.setup();
    const stream = streamPort();
    const loadSuggestions = vi.fn().mockResolvedValue([]);
    const ai: AiAssistantPort = {
      ask: vi.fn().mockResolvedValue({ answer: "no data", evidence: [], action: null }),
      loadSuggestions,
      createAlertRule: vi.fn().mockResolvedValue({ ruleId: "rule-1" }),
    };
    renderShell({
      aiAssistantPort: ai,
      initialEntry: "/resources?clusters=cluster-1",
      logStreamPort: stream.port,
      releasedSurfaceIds: new Set(["home", "resources"]),
    });
    await user.click(screen.getByRole("button", { name: "checkout 로그 열기" }));
    flushEventFrame(() => stream.emit(
      "checkout",
      { type: "connected", streamId: "stream-checkout" },
    ));
    await waitFor(() => expect(screen.getByText("실시간")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "현재 로그를 Kyro AI에 질문" }));

    await waitFor(() => expect(loadSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ logStreamId: "stream-checkout" }),
      expect.any(AbortSignal),
    ));
    expect(JSON.stringify(loadSuggestions.mock.calls[0]?.[0])).not.toContain("raw log line");
  });

  it("releases terminal subscriptions and ignores stale retry callbacks", async () => {
    const user = userEvent.setup();
    const stream = controlledStreamPort();
    renderShell({
      initialEntry: "/resources?clusters=cluster-1",
      logStreamPort: stream.port,
      releasedSurfaceIds: new Set(["home", "resources"]),
    });

    await user.click(screen.getByRole("button", { name: "checkout 로그 열기" }));
    const first = stream.latest("checkout");
    flushEventFrame(() => first.onEvent({ type: "end", reason: "complete" }));
    await waitFor(() => expect(screen.getByText("종료됨")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "checkout 로그 열기" }));
    const second = stream.latest("checkout");
    expect(second).not.toBe(first);
    first.onFailure(new LogStreamFailure("offline"));
    flushEventFrame(() => second.onEvent({ type: "connected", streamId: "stream-current" }));
    await waitFor(() => expect(screen.getByText("실시간")).toBeTruthy());
    expect(screen.queryByText("연결 실패")).toBeNull();
  });
});

function flushEventFrame(emit: () => void) {
  const originalRequestFrame = globalThis.requestAnimationFrame;
  const originalCancelFrame = globalThis.cancelAnimationFrame;
  const frames = new QueuedAnimationFrames();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => frames.request(callback)));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((frame) => frames.cancel(frame)));
  try {
    act(emit);
    act(() => frames.flush());
  } finally {
    vi.stubGlobal("requestAnimationFrame", originalRequestFrame);
    vi.stubGlobal("cancelAnimationFrame", originalCancelFrame);
  }
}

class QueuedAnimationFrames {
  private nextId = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();

  request(callback: FrameRequestCallback): number {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }

  cancel(id: number): void {
    this.callbacks.delete(id);
  }

  flush(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(performance.now());
  }
}

function streamPort() {
  const handlers = new Map<string, LogStreamHandlers>();
  const port: LogStreamPort = {
    open: vi.fn((target: LogStreamTarget, next: LogStreamHandlers) => {
      handlers.set(target.name, next);
      return () => handlers.delete(target.name);
    }),
  };
  return {
    port,
    emit(name: string, event: Parameters<LogStreamHandlers["onEvent"]>[0]) {
      handlers.get(name)?.onEvent(event);
    },
  };
}

function controlledStreamPort() {
  const calls = new Map<string, LogStreamHandlers[]>();
  const port: LogStreamPort = {
    open(target, handlers) {
      const existing = calls.get(target.name) ?? [];
      calls.set(target.name, [...existing, handlers]);
      return () => undefined;
    },
  };
  return {
    port,
    latest(name: string) {
      const handlers = calls.get(name);
      if (!handlers?.length) throw new Error(`missing stream handlers for ${name}`);
      return handlers[handlers.length - 1]!;
    },
  };
}
