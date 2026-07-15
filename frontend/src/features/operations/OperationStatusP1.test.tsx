// @vitest-environment jsdom

import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  vi.useRealTimers();
});

describe("operation status P1 lifecycle", () => {
  it("survives StrictMode effect replay and disposes only after the real root unmount", async () => {
    vi.useFakeTimers();
    const store = createOperationStatusStore(emptyPort());
    const dispose = vi.spyOn(store, "dispose");
    const view = render(
      <StrictMode>
        <OperationStatusStoreProvider store={store}>
          <div>root</div>
        </OperationStatusStoreProvider>
      </StrictMode>,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(dispose).not.toHaveBeenCalled();

    view.unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps keyboard focus on the reobserve control through Enter and Space", async () => {
    const user = userEvent.setup();
    let subscriptions = 0;
    const port: OperationEventsPort = {
      async *subscribeOperationEvents() {
        subscriptions += 1;
        if (subscriptions === 1) throw new Error("network unavailable");
        await new Promise(() => undefined);
        yield operationEvent(1, "progress");
      },
    };
    const store = createOperationStatusStore(port);
    store.start("command-1");
    renderFeedback(store);

    const reobserve = await screen.findByRole("button", {
      name: "명령 재실행 없이 스트림 다시 관찰",
    });
    reobserve.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(store.getSnapshot("command-1").status).toBe("connecting"));
    expect(document.activeElement).toBe(reobserve);
    await user.keyboard(" ");
    expect(document.activeElement).toBe(reobserve);
    expect(subscriptions).toBe(2);
    store.dispose();
  });
});

function renderFeedback(store: ReturnType<typeof createOperationStatusStore>) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <OperationStatusStoreProvider store={store}>
        <OperationStatusFeedback commandId="command-1" correlationId="correlation-1" />
      </OperationStatusStoreProvider>
    </I18nProvider>,
  );
}

function emptyPort(): OperationEventsPort {
  return {
    async *subscribeOperationEvents() {
      await new Promise(() => undefined);
      yield operationEvent(1, "progress");
    },
  };
}

function operationEvent(sequence: number, kind: "progress" | "log" | "completed" | "failed") {
  return {
    commandId: "command-1",
    sequence,
    kind,
    payload: {},
    occurredAt: "2026-07-15T00:00:00Z",
  };
}
