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
    { language: "ko-KR", reopen: "작업 센터 다시 열기", summary: "작업 1개 추적 중 · 확인 필요 1개" },
    { language: "en-US", reopen: "Reopen operation center", summary: "1 tracked operations · 1 need attention" },
  ])("keeps a collapsed $language dock discoverable and reopens its operation center", async ({ language, reopen, summary }) => {
    const user = userEvent.setup();
    const store = unavailableStore();
    store.start("command-1");
    await waitFor(() => expect(store.getSnapshot("command-1").status).toBe("unavailable"));

    renderDock(store, language);
    await user.click(screen.getByRole("button", {
      name: language === "ko-KR" ? "로그 독 접기" : "Collapse log dock",
    }));

    expect(screen.getByText(summary)).toBeTruthy();
    const reopenAction = screen.getByRole("button", { name: reopen });
    await user.click(reopenAction);

    expect(screen.getByRole("region", {
      name: language === "ko-KR" ? "작업 센터" : "Operation center",
    })).toBeTruthy();
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
      throw new Error("network unavailable");
    },
  };
  return createOperationStatusStore(port);
}
