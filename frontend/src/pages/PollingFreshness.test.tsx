// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../shared/i18n";
import { PollingFreshness } from "./PollingFreshness";

afterEach(cleanup);

describe("PollingFreshness", () => {
  it("switches visible status and refresh labels from the typed catalog", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <LocaleSwitch />
        <PollingFreshness
          dataUpdatedAt={Date.now() - 5_000}
          intervalSeconds={30}
          isFetching={false}
          onRefresh={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Checks every 30s")).toBeTruthy();
    expect(screen.getByText(/updated \d+s ago/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "한국어로 전환" }));

    expect(screen.getByText("30초마다 확인")).toBeTruthy();
    expect(screen.getByText(/\d+초 전 갱신/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "새로 고침" })).toBeTruthy();
  });
});

function LocaleSwitch() {
  const { setLocale } = useI18n();
  return (
    <button onClick={() => setLocale("ko")} type="button">
      한국어로 전환
    </button>
  );
}
