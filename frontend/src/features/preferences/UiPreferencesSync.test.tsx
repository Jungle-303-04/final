// @vitest-environment jsdom

import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../../shared/i18n";
import type {
  ShellStatePort,
  UiPreferencesRecord,
} from "../shell-state/shellStateContract";
import { UiPreferencesSync } from "./UiPreferencesSync";

const { selectTheme } = vi.hoisted(() => ({ selectTheme: vi.fn() }));

vi.mock("../../shared/ui/useProductTheme", () => ({
  useProductTheme: () => ({
    isDark: false,
    select: selectTheme,
    selection: "light",
    toggle: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  selectTheme.mockClear();
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("UiPreferencesSync first-paint ownership", () => {
  it("shares the initial server read across the StrictMode replacement mount", async () => {
    let requestSignal: AbortSignal | undefined;
    const getUiPreferences = vi.fn((signal: AbortSignal) => {
      requestSignal = signal;
      return new Promise<UiPreferencesRecord>(() => undefined);
    });
    const port = shellStatePort({
      getUiPreferences,
      updateUiPreferences: vi.fn(),
    });

    render(
      <StrictMode>
        <I18nProvider storage={window.localStorage}>
          <UiPreferencesSync port={port} />
        </I18nProvider>
      </StrictMode>,
    );
    await act(async () => { await Promise.resolve(); });

    expect(getUiPreferences).toHaveBeenCalledOnce();
    expect(requestSignal?.aborted).toBe(false);
  });

  it("never replaces the visible browser locale after an asynchronous server read", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("opsia.locale", "ko");
    const updateUiPreferences = vi.fn().mockResolvedValue({
      preferences: { locale: "ko", theme: "light" },
      revision: 8,
    });
    const port = shellStatePort({
      getUiPreferences: vi.fn().mockResolvedValue({
        preferences: { locale: "en", theme: "dark" },
        revision: 7,
      }),
      updateUiPreferences,
    });

    render(
      <I18nProvider storage={window.localStorage}>
        <UiPreferencesSync port={port} />
        <VisibleLocale />
      </I18nProvider>,
    );

    expect(screen.getByText("ko:다시 시도")).toBeTruthy();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("ko:다시 시도")).toBeTruthy();
    expect(selectTheme).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(updateUiPreferences).toHaveBeenCalledWith({
      expectedRevision: 7,
      preferences: { locale: "ko", theme: "light" },
    }, expect.any(AbortSignal));
    expect(screen.getByText("ko:다시 시도")).toBeTruthy();
  });
});

function VisibleLocale() {
  const { locale, t } = useI18n();
  return <span>{locale}:{t("common.action.retry")}</span>;
}

function shellStatePort(
  ui: Pick<ShellStatePort, "getUiPreferences" | "updateUiPreferences">,
): ShellStatePort {
  return {
    ...ui,
    getNamespaceScope: vi.fn(),
    updateNamespaceScope: vi.fn(),
  };
}
