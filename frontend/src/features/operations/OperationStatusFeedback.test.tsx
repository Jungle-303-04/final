// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import type { OperationEventsPort } from "./operationEventsContract";
import {
  createOperationStatusStore,
  OperationStatusStoreProvider,
} from "./OperationStatusStore";
import { OperationStatusFeedback } from "./OperationStatusFeedback";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("operation status feedback", () => {
  it("renders a completed drain with partial Pod failures as a warning with bounded details", async () => {
    const port: OperationEventsPort = {
      async *subscribeOperationEvents(commandId) {
        yield {
          commandId,
          sequence: 1,
          kind: "completed" as const,
          payload: {
            result: {
              evicted: 1,
              failed: 1,
              skipped: 1,
              partial_failure: true,
              resources: [
                { namespace: "shop", name: "checkout-1", status: "evicted" },
                { namespace: "shop", name: "checkout-2", status: "failed", error: "PdbDenied" },
                { namespace: "system", name: "agent-1", reason: "daemonset" },
              ],
            },
          },
          occurredAt: "2026-07-17T00:00:00Z",
        };
      },
    };
    const store = createOperationStatusStore(port);
    store.start("command-drain");

    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <OperationStatusStoreProvider store={store}>
          <OperationStatusFeedback commandId="command-drain" correlationId="correlation-drain" />
        </OperationStatusStoreProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("status").getAttribute("data-status")).toBe("completed-with-warnings");
    });
    expect(screen.getByText("Completed with warnings")).toBeTruthy();
    expect(screen.getByText("Evicted 1 · Failed 1 · Skipped 1")).toBeTruthy();
    expect(screen.getByText(/checkout-2.*PdbDenied/u)).toBeTruthy();
    expect(screen.getByText(/agent-1.*daemonset/u)).toBeTruthy();
    store.dispose();
  });

  it("announces the observation state without motion when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    })));
    const port: OperationEventsPort = {
      async *subscribeOperationEvents() {
        await new Promise(() => undefined);
        yield {
          commandId: "command-1",
          sequence: 1,
          kind: "progress" as const,
          payload: {},
          occurredAt: "2026-07-15T00:00:00Z",
        };
      },
    };
    const store = createOperationStatusStore(port);
    store.start("command-1");

    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <OperationStatusStoreProvider store={store}>
          <OperationStatusFeedback commandId="command-1" correlationId="correlation-1" />
        </OperationStatusStoreProvider>
      </I18nProvider>,
    );

    const feedback = screen.getByRole("status");
    expect(feedback.getAttribute("aria-live")).toBe("polite");
    expect(feedback.getAttribute("aria-atomic")).toBe("true");
    expect(feedback.getAttribute("data-reduced-motion")).toBe("true");
    expect(feedback.textContent).toContain("연결 중");
    store.dispose();
  });

  it("reobserves only the failed stream when the observer transport becomes available", async () => {
    let subscriptions = 0;
    const port: OperationEventsPort = {
      async *subscribeOperationEvents() {
        subscriptions += 1;
        if (subscriptions === 1) throw new Error("network unavailable");
        yield {
          commandId: "command-1",
          sequence: 1,
          kind: "completed" as const,
          payload: {},
          occurredAt: "2026-07-15T00:00:00Z",
        };
      },
    };
    const store = createOperationStatusStore(port);
    store.start("command-1");

    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <OperationStatusStoreProvider store={store}>
          <OperationStatusFeedback commandId="command-1" correlationId="correlation-1" />
        </OperationStatusStoreProvider>
      </I18nProvider>,
    );

    const action = await screen.findByRole("button", {
      name: "명령 재실행 없이 스트림 다시 관찰",
    });
    fireEvent.click(action);

    await waitFor(() => {
      expect(screen.getByRole("status").getAttribute("data-status")).toBe("completed");
    });
    expect(subscriptions).toBe(2);
    store.dispose();
  });
});
