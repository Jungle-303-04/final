// @vitest-environment jsdom

import { ThemeProvider } from "next-themes";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  I18nProvider,
  type LocaleStorage,
  type SupportedLocale,
} from "../../shared/i18n";
import { AuthBarrier } from "./AuthBarrier";
import type { AuthPort } from "./authContract";
import {
  createAuthAdapter,
  type AuthEndpointDependencies,
} from "./createAuthAdapter";

const UNAUTHENTICATED_SESSION = {
  authenticated: false,
  user_id: "",
  roles: [],
  workspace_id: "",
} as const;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("localized authentication boundary", () => {
  it("renders the complete login contract in English", async () => {
    renderBarrier(unauthenticatedPort(), "en");

    expect(await screen.findByRole("heading", { name: "Sign in to Kyro" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "ID or email" })).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose theme" })).toBeTruthy();
    const publicHeader = screen.getByRole("banner");
    const loginCard = screen.getByRole("heading", { name: "Sign in to Kyro" })
      .closest('[data-slot="card"]');
    expect(publicHeader.textContent).toContain("Kyro");
    expect(publicHeader.querySelector('[aria-label="Current language: English"]')).toBeTruthy();
    expect(loginCard?.querySelector('[aria-label="Current language: English"]')).toBeNull();
  });

  it("switches and persists locale before authentication", async () => {
    const user = userEvent.setup();
    const view = renderBarrier(unauthenticatedPort(), "ko", window.localStorage);

    await screen.findByRole("heading", { name: "Kyro에 로그인" });
    await user.click(screen.getByRole("combobox", { name: "현재 언어: 한국어" }));
    await user.click(await screen.findByRole("option", { name: "영어" }));

    expect(screen.getByRole("heading", { name: "Sign in to Kyro" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Current language: English" })).toBeTruthy();
    expect(window.localStorage.getItem("opsia.locale")).toBe("en");

    view.unmount();
    await Promise.resolve();
    renderBarrier(unauthenticatedPort(), "ko", window.localStorage);
    expect(await screen.findByRole("heading", { name: "Sign in to Kyro" })).toBeTruthy();
  });

  it.each([
    ["ko", undefined],
    ["ko", "provider_only_reason"],
    ["en", undefined],
    ["en", "provider_only_reason"],
  ] as const)("shows approved plain detail in %s when code is %s", async (locale, code) => {
    const detail = "Authentication is temporarily unavailable.";
    const port = endpointPort({
      getSession: vi.fn().mockRejectedValue({
        kind: "http",
        code,
        detail,
        status: 503,
      }),
    });

    renderBarrier(port, locale);

    expect(await screen.findByText(detail)).toBeTruthy();
  });

  it.each([
    ["ko", "이메일 인증을 완료한 뒤 다시 로그인하세요."],
    ["en", "Verify your email, then sign in again."],
  ] as const)("prefers catalog copy over known-code detail in %s", async (locale, message) => {
    const privateDetail = "Private provider detail";
    const port = endpointPort({
      login: vi.fn().mockRejectedValue({
        kind: "forbidden",
        code: "email_unverified",
        detail: privateDetail,
        status: 403,
      }),
    });
    const user = userEvent.setup();
    renderBarrier(port, locale);

    await user.type(
      await screen.findByRole("textbox", {
        name: locale === "ko" ? "아이디 또는 이메일" : "ID or email",
      }),
      "operator@example.com",
    );
    await user.type(screen.getByLabelText(locale === "ko" ? "비밀번호" : "Password"), "secret");
    await user.click(screen.getByRole("button", { name: locale === "ko" ? "로그인" : "Sign in" }));

    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(document.body.textContent).not.toContain(privateDetail);
  });
});

function unauthenticatedPort(): AuthPort {
  return endpointPort();
}

function endpointPort(overrides: Partial<AuthEndpointDependencies> = {}): AuthPort {
  return createAuthAdapter({
    getSession: vi.fn().mockResolvedValue(UNAUTHENTICATED_SESSION),
    login: vi.fn().mockResolvedValue(UNAUTHENTICATED_SESSION),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });
}

function renderBarrier(
  port: AuthPort,
  locale: SupportedLocale,
  storage: LocaleStorage | null = null,
) {
  return render(
    <StrictMode>
      <I18nProvider navigatorLanguage={locale} storage={storage}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          themes={["light", "dark"]}
        >
          <AuthBarrier port={port}>{() => <main>Authenticated product</main>}</AuthBarrier>
        </ThemeProvider>
      </I18nProvider>
    </StrictMode>,
  );
}
