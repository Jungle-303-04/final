// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { I18nProvider, useI18n } from "../../shared/i18n";
import type { AlertEventsPort } from "./alertEventsContract";
import { AlertEventsProvider } from "./AlertEventsProvider";

afterEach(() => cleanup());

describe("AlertEventsProvider locale lifecycle", () => {
  it("keeps one polling session when the user changes locale", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const port = {
      list,
      acknowledge: vi.fn(),
      promote: vi.fn(),
    } as AlertEventsPort;

    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter>
          <AlertEventsProvider port={port}>
            <LocaleProbe />
          </AlertEventsProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "locale-probe" }));
    await waitFor(() => expect(screen.getByText("en")).toBeTruthy());
    await Promise.resolve();

    expect(list).toHaveBeenCalledTimes(1);
  });
});

function LocaleProbe() {
  const { locale, setLocale } = useI18n();
  return (
    <button aria-label="locale-probe" onClick={() => setLocale("en")} type="button">
      {locale}
    </button>
  );
}
