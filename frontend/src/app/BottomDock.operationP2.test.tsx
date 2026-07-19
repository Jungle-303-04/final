// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../features/auth/AuthSessionGate";
import { BottomDockProvider } from "../features/bottom-dock/BottomDockProvider";
import {
  createOperationStatusStore,
  OperationStatusStoreProvider,
} from "../features/operations/OperationStatusStore";
import type { OperationEventsPort } from "../features/operations/operationEventsContract";
import { I18nProvider } from "../shared/i18n";
import { BottomDock } from "./BottomDock";

afterEach(cleanup);

describe("BottomDock operation surface removal", () => {
  it("keeps operation state available without rendering an independent center", async () => {
    const store = createOperationStatusStore(completedOperation());
    store.start("command-1");
    await waitFor(() => expect(store.getSnapshot("command-1").status).toBe("completed"));

    const { container } = render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
          <OperationStatusStoreProvider store={store}>
            <BottomDockProvider>
              <BottomDock onAskAi={() => undefined} />
            </BottomDockProvider>
          </OperationStatusStoreProvider>
        </AuthSessionGateProvider>
      </I18nProvider>,
    );

    expect(container.querySelector('[data-slot="operation-status-center"]')).toBeNull();
    expect(screen.queryByRole("region", { name: "작업 센터" })).toBeNull();
    expect(container.querySelector('[data-slot="bottom-dock"]')).toBeNull();
    store.dispose();
  });
});

function completedOperation(): OperationEventsPort {
  return {
    async *subscribeOperationEvents(commandId) {
      yield {
        commandId,
        kind: "completed",
        occurredAt: new Date().toISOString(),
        payload: {},
        sequence: 1,
      };
    },
  };
}
