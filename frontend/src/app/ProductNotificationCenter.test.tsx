// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AlertEventsProvider } from "../features/alerts/AlertEventsProvider";
import { EMPTY_ALERT_EVENTS_PORT } from "../features/alerts/alertEventsContract";
import { ProductNotificationsProvider } from "../features/notifications/ProductNotificationsProvider";
import {
  createOperationStatusStore,
  OperationStatusStoreProvider,
} from "../features/operations/OperationStatusStore";
import type { OperationEventsPort } from "../features/operations/operationEventsContract";
import { I18nProvider } from "../shared/i18n";
import { toast } from "../shared/ui/primitives/sonner";
import { ProductNotificationCenter } from "./ProductNotificationCenter";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("ProductNotificationCenter operation contract", () => {
  it("absorbs a live operation into the in-progress section with real progress", async () => {
    const store = createOperationStatusStore(progressOperation());
    store.start("rollout-checkout");
    await waitFor(() => expect(store.getSnapshot("rollout-checkout").status).toBe("running"));
    renderCenter(store);

    await userEvent.click(screen.getByRole("button", { name: "Notifications · 0 unread" }));
    expect(screen.getByRole("region", { name: "In progress" })).toBeTruthy();
    const progress = screen.getByRole("progressbar", { name: "Rollout checkout · 4 of 10 Pods" });
    expect(progress.getAttribute("aria-valuenow")).toBe("40");
    store.dispose();
  });

  it("emits one result toast for one terminal command event", async () => {
    const success = vi.spyOn(toast, "success");
    const store = createOperationStatusStore(completedOperation());
    store.start("rollout-checkout");
    await waitFor(() => expect(store.getSnapshot("rollout-checkout").status).toBe("completed"));
    const rendered = renderCenter(store);

    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    rendered.rerender(rendered.ui);
    await Promise.resolve();
    expect(success).toHaveBeenCalledTimes(1);
    store.dispose();
  });
});

function renderCenter(store: ReturnType<typeof createOperationStatusStore>) {
  const ui = (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <MemoryRouter>
        <AlertEventsProvider port={EMPTY_ALERT_EVENTS_PORT}>
          <ProductNotificationsProvider>
            <OperationStatusStoreProvider store={store}>
              <ProductNotificationCenter />
            </OperationStatusStoreProvider>
          </ProductNotificationsProvider>
        </AlertEventsProvider>
      </MemoryRouter>
    </I18nProvider>
  );
  return { ...render(ui), ui };
}

function progressOperation(): OperationEventsPort {
  return {
    async *subscribeOperationEvents(commandId) {
      yield {
        commandId,
        kind: "progress",
        occurredAt: new Date().toISOString(),
        payload: { title: "Rollout checkout", message: "4 of 10 Pods", completed: 4, total: 10 },
        sequence: 1,
      };
      await new Promise(() => undefined);
    },
  };
}

function completedOperation(): OperationEventsPort {
  return {
    async *subscribeOperationEvents(commandId) {
      yield {
        commandId,
        kind: "completed",
        occurredAt: new Date().toISOString(),
        payload: { title: "Rollout checkout" },
        sequence: 1,
      };
    },
  };
}
