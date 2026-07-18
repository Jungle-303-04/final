// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_LOCALE_STORAGE_KEY } from "./shared/i18n/locale";

const authenticatedRuntimeMock = vi.hoisted(() => ({ evaluations: 0 }));

vi.mock("./app/authBootstrap", () => ({
  createAuthBootstrap() {
    return {
      loadSession: async () => ({ status: "unauthenticated" as const }),
      signIn: async () => { throw new Error("not used"); },
      signOut: async () => undefined,
    };
  },
}));

vi.mock("./app/AuthenticatedProductRuntime", () => {
  authenticatedRuntimeMock.evaluations += 1;
  return {
    AuthenticatedProductRuntime: () => <p>Authenticated product runtime</p>,
  };
});

import ProductApp from "./ProductApp";

beforeEach(() => {
  authenticatedRuntimeMock.evaluations = 0;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
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
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("ProductApp authenticated runtime boundary", () => {
  it("does not evaluate product composition or page code for an unauthenticated visitor", async () => {
    window.localStorage.setItem(PRODUCT_LOCALE_STORAGE_KEY, "en");
    render(
      <StrictMode>
        <ProductApp />
      </StrictMode>,
    );

    expect(await screen.findByRole("heading", { name: "Sign in to Opsia" })).toBeTruthy();
    expect(authenticatedRuntimeMock.evaluations).toBe(0);
  });
});
