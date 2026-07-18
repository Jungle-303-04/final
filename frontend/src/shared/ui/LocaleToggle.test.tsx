// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { PRODUCT_LOCALE_STORAGE_KEY } from "../i18n/locale";
import { LocaleToggle } from "./LocaleToggle";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("lang");
});

describe("LocaleToggle", () => {
  it("shows the current English locale and switches immediately to Korean", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PRODUCT_LOCALE_STORAGE_KEY, "en");
    render(
      <I18nProvider storage={window.localStorage} navigatorLanguage="en-US">
        <LocaleToggle />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("combobox", { name: "Current language: English" });
    expect(trigger.textContent).toContain("English");
    expect(trigger.className).toContain("w-(--product-toolbar-compact-control-width)");

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "Korean" }));

    await waitFor(() => {
      const localizedTrigger = screen.getByRole("combobox", { name: "현재 언어: 한국어" });
      expect(localizedTrigger).toBe(trigger);
      expect(localizedTrigger.className).toContain("w-(--product-toolbar-compact-control-width)");
    });
    expect(document.documentElement.lang).toBe("ko");
    expect(window.localStorage.getItem(PRODUCT_LOCALE_STORAGE_KEY)).toBe("ko");
  });

  it("uses Korean navigator preference when no persisted locale exists", () => {
    render(
      <I18nProvider storage={window.localStorage} navigatorLanguage="ko-KR">
        <LocaleToggle />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("combobox", { name: "현재 언어: 한국어" });
    expect(trigger.textContent).toContain("한국어");
    expect(document.documentElement.lang).toBe("ko");
  });

  it("lets a persisted locale override navigator preference", () => {
    window.localStorage.setItem(PRODUCT_LOCALE_STORAGE_KEY, "en");
    render(
      <I18nProvider storage={window.localStorage} navigatorLanguage="ko-KR">
        <LocaleToggle />
      </I18nProvider>,
    );

    expect(screen.getByRole("combobox", { name: "Current language: English" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });
});
