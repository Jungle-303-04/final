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
