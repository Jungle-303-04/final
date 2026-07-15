// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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
    expect(feedback).toHaveAttribute("aria-live", "polite");
    expect(feedback).toHaveAttribute("aria-atomic", "true");
    expect(feedback).toHaveAttribute("data-reduced-motion", "true");
    expect(feedback.textContent).toContain("연결 중");
    store.dispose();
  });
});
