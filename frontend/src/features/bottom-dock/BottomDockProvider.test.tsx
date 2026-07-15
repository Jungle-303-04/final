// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../auth/AuthSessionGate";
import type { LogStreamHandlers, LogStreamPort } from "../log-stream/logStreamContract";
import { BottomDockProvider, useBottomDock } from "./BottomDockProvider";

let scheduledFrame: FrameRequestCallback | null = null;

beforeEach(() => {
  scheduledFrame = null;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    scheduledFrame = callback;
    return 17;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BottomDockProvider", () => {
  it("reduces all transport events received in one animation frame in a single update", () => {
    let handlers: LogStreamHandlers | null = null;
    const port: LogStreamPort = {
      open: vi.fn((_target, nextHandlers) => {
        handlers = nextHandlers;
        return vi.fn();
      }),
    };
    const observedReceived: number[] = [];
    render(
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        <BottomDockProvider port={port}>
          <DockProbe onRender={(received) => observedReceived.push(received)} />
        </BottomDockProvider>
      </AuthSessionGateProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByTestId("dock-connection-announcer").textContent)
      .toBe("checkout: connecting");
    act(() => {
      handlers?.onEvent({ type: "connected", streamId: "stream-1" });
      handlers?.onEvent(line("line-1"));
      handlers?.onEvent(line("line-2"));
    });

    expect(screen.getByTestId("received").textContent).toBe("0");
    expect(scheduledFrame).not.toBeNull();
    act(() => scheduledFrame?.(16));
    expect(screen.getByTestId("received").textContent).toBe("2");
    expect(screen.getByTestId("status").textContent).toBe("streaming");
    expect(screen.getByTestId("dock-connection-announcer").textContent)
      .toBe("checkout: streaming");
    expect(observedReceived.filter((value) => value > 0)).toEqual([2]);
  });
});

function DockProbe({ onRender }: { onRender: (received: number) => void }) {
  const dock = useBottomDock();
  const tab = dock.tabs[0];
  onRender(tab?.received ?? 0);
  return (
    <>
      <button
        onClick={() => dock.openLogs({
          type: "pod",
          clusterId: "cluster-1",
          namespace: "shop",
          name: "checkout",
          container: null,
        })}
        type="button"
      >
        open
      </button>
      <span data-testid="received">{tab?.received ?? 0}</span>
      <span data-testid="status">{tab?.status ?? "closed"}</span>
    </>
  );
}

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
