// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  I18nProvider,
  useI18n,
  type I18nController,
} from "./I18nProvider";
import { PRODUCT_LOCALE_STORAGE_KEY } from "./locale";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("lang");
  vi.restoreAllMocks();
});

describe("I18nProvider", () => {
  it("defaults to Korean when no explicit locale was persisted", () => {
    const controller: { current: I18nController | null } = { current: null };
    render(
      <I18nProvider storage={window.localStorage} navigatorLanguage="en-US">
        <Consumer capture={(value) => { controller.current = value; }} />
      </I18nProvider>,
    );

    expect(screen.getByText("다시 시도")).toBeTruthy();
    expect(controller.current?.locale).toBe("ko");
    expect(document.documentElement.lang).toBe("ko");
  });

  it("uses navigator Korean when no explicit locale was persisted", () => {
    const controller: { current: I18nController | null } = { current: null };
    render(
      <I18nProvider storage={window.localStorage} navigatorLanguage="ko-KR">
        <Consumer capture={(value) => { controller.current = value; }} />
      </I18nProvider>,
    );

    expect(screen.getByText("다시 시도")).toBeTruthy();
    expect(controller.current?.locale).toBe("ko");
    expect(document.documentElement.lang).toBe("ko");
  });

  it("lets persisted English override a Korean navigator language", () => {
    window.localStorage.setItem(PRODUCT_LOCALE_STORAGE_KEY, "en");
    render(
      <I18nProvider storage={window.localStorage} navigatorLanguage="ko-KR">
        <Consumer />
      </I18nProvider>,
    );

    expect(screen.getByText("Retry")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it("exposes a user locale switch that persists and updates all helpers", () => {
    const controller: { current: I18nController | null } = { current: null };
    render(
      <I18nProvider storage={window.localStorage} navigatorLanguage="en-US">
        <Consumer capture={(value) => { controller.current = value; }} />
      </I18nProvider>,
    );

    act(() => { controller.current?.setLocale("ko"); });

    expect(screen.getByText("다시 시도")).toBeTruthy();
    expect(window.localStorage.getItem(PRODUCT_LOCALE_STORAGE_KEY)).toBe("ko");
    expect(document.documentElement.lang).toBe("ko");
    expect(controller.current?.formatNumber(1234)).toBe(
      new Intl.NumberFormat("ko-KR").format(1234),
    );
  });

  it("fails closed when useI18n is called outside its provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Consumer />)).toThrow(
      "useI18n must be used within I18nProvider",
    );
  });
});

function Consumer({ capture }: { capture?: (controller: I18nController) => void }) {
  const controller = useI18n();
  capture?.(controller);
  return <span>{controller.t("common.action.retry")}</span>;
}
