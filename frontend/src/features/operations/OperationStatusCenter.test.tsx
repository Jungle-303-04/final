// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BottomDock } from "../../app/BottomDock";
import { I18nProvider } from "../../shared/i18n";
import type { OperationEventsPort } from "./operationEventsContract";
import {
  createOperationStatusStore,
  OperationStatusStoreProvider,
} from "./OperationStatusStore";
import { OperationStatusFeedback } from "./OperationStatusFeedback";

afterEach(cleanup);

describe("operation status center cutover", () => {
  it("does not revive the legacy operation center in the logs-only bottom dock", async () => {
    const port: OperationEventsPort = {
      async *subscribeOperationEvents() {
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

    const view = render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <OperationStatusStoreProvider store={store}>
          <OperationStatusFeedback commandId="command-1" correlationId="correlation-1" />
          <BottomDock onAskAi={() => undefined} />
        </OperationStatusStoreProvider>
      </I18nProvider>,
    );

    await waitFor(() => expect(store.getSnapshot("command-1").status).toBe("completed"));
    view.rerender(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <OperationStatusStoreProvider store={store}>
          <BottomDock onAskAi={() => undefined} />
        </OperationStatusStoreProvider>
      </I18nProvider>,
    );

    expect(screen.queryByRole("region", { name: "작업 센터" })).toBeNull();
    expect(screen.queryByText("command-1")).toBeNull();
    expect(screen.queryByText("완료됨")).toBeNull();
    store.dispose();
  });
});
