// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../features/auth/AuthSessionGate";
import { BottomDockProvider } from "../features/bottom-dock/BottomDockProvider";
import { createOperationStatusStore, OperationStatusStoreProvider } from "../features/operations/OperationStatusStore";
import type { OperationEventsPort } from "../features/operations/operationEventsContract";
import { I18nProvider } from "../shared/i18n";
import { BottomDock } from "./BottomDock";

afterEach(cleanup);

describe("BottomDock operation center P2", () => {
  it.each([
    { language: "ko-KR", title: "작업 센터" },
    { language: "en-US", title: "Operation center" },
  ])("uses one visible operation heading and one region in $language", async ({ language, title }) => {
    const store = unavailableStore();
    store.start("command-1");
    await waitFor(() => expect(store.getSnapshot("command-1").status).toBe("unavailable"));

    const { container } = renderDock(store, language);

    expect(screen.getAllByRole("heading", { name: title })).toHaveLength(1);
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(container.querySelector('[data-slot="operation-status-center"]')?.className).toContain("max-w-full");
    store.dispose();
  });

  it.each([
    { language: "ko-KR", reopen: "작업 센터 다시 열기", summary: "작업 3개 추적 중 · 확인 필요 2개" },
    { language: "en-US", reopen: "Reopen operation center", summary: "3 tracked operations · 2 need attention" },
  ])("keeps a collapsed $language dock discoverable and reopens its operation center", async ({ language, reopen, summary }) => {
    const user = userEvent.setup();
    const store = mixedStatusStore();
    store.start("command-completed");
    store.start("command-running");
    store.start("command-failed");
    await waitFor(() => expect(store.getSnapshot("command-completed").status).toBe("completed"));
    await waitFor(() => expect(store.getSnapshot("command-running").status).toBe("running"));
    await waitFor(() => expect(store.getSnapshot("command-failed").status).toBe("failed"));

    renderDock(store, language);
    await user.click(screen.getByRole("button", {
      name: language === "ko-KR" ? "로그 독 접기" : "Collapse log dock",
    }));

    expect(screen.getByText(summary)).toBeTruthy();
    const reopenAction = screen.getByRole("button", { name: reopen });
    reopenAction.focus();
    await user.keyboard("{Enter}");

    const operationCenter = screen.getByRole("region", {
      name: language === "ko-KR" ? "작업 센터" : "Operation center",
    });
    await waitFor(() => expect(document.activeElement).toBe(operationCenter));
    store.dispose();
  });
});

function renderDock(store: ReturnType<typeof createOperationStatusStore>, language: string) {
  return render(
    <I18nProvider navigatorLanguage={language} storage={null}>
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        <OperationStatusStoreProvider store={store}>
          <BottomDockProvider>
            <BottomDock onAskAi={() => undefined} />
          </BottomDockProvider>
        </OperationStatusStoreProvider>
      </AuthSessionGateProvider>
    </I18nProvider>,
  );
}

function unavailableStore() {
  const port: OperationEventsPort = {
    async *subscribeOperationEvents() {
      yield* [] as never[];
      throw new Error("network unavailable");
    },
  };
  return createOperationStatusStore(port);
}

function mixedStatusStore() {
  const port: OperationEventsPort = {
    async *subscribeOperationEvents(commandId) {
      const kind = commandId === "command-completed"
        ? "completed"
        : commandId === "command-failed"
          ? "failed"
          : "progress";
      yield {
        commandId,
        kind,
        occurredAt: "2026-07-15T00:00:00Z",
        payload: {},
        sequence: 1,
      };
      if (kind === "progress") await new Promise(() => undefined);
    },
  };
  return createOperationStatusStore(port);
}
