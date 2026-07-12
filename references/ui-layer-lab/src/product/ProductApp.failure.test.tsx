// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const compositionMock = vi.hoisted(() => ({
  attempts: 0,
  shouldFail: true,
}));

vi.mock("./app/apiComposition", async () => {
  const { createProductComposition } = await vi.importActual<
    typeof import("./app/productComposition")
  >("./app/productComposition");
  const auth = {
    loadSession: async () => ({ status: "unauthenticated" as const }),
    signIn: async () => { throw new Error("not used"); },
    signOut: async () => undefined,
  };

  return {
    createApiComposition() {
      compositionMock.attempts += 1;
      if (compositionMock.shouldFail) throw new Error("private-composition-stack-token");
      return createProductComposition([], auth);
    },
  };
});

import ProductApp from "./ProductApp";

beforeEach(() => {
  compositionMock.attempts = 0;
  compositionMock.shouldFail = true;
  vi.useRealTimers();
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
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.useRealTimers();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("ProductApp composition failure", () => {
  it("contains initialization failure and retries through the private composition root", async () => {
    render(
      <StrictMode>
        <ProductApp />
      </StrictMode>,
    );

    expect(screen.getByRole("heading", { name: "Unable to read the verified response" }))
      .toBeTruthy();
    expect(document.body.textContent).not.toContain("private-composition-stack-token");
    const attemptsBeforeRetry = compositionMock.attempts;
    expect(attemptsBeforeRetry).toBeGreaterThan(0);

    compositionMock.shouldFail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Reopen screen" }));

    expect(compositionMock.attempts).toBeGreaterThan(attemptsBeforeRetry);
    expect(await screen.findByRole("heading", { name: "Sign in to KubeHeal" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  }, 15_000);
});
