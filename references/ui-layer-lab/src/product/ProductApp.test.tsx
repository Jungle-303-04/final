// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductComposition } from "./app/productComposition";
import ProductApp from "./ProductApp";

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

describe("ProductApp root recovery", () => {
  it("keeps the zero-approval composition shell-free", () => {
    render(<ProductApp />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "API 연결 계층을 검증하고 있습니다" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("catches composition initialization failures and retries only on request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let shouldFail = true;
    const compositionFactory = vi.fn(() => {
      if (shouldFail) throw new Error("private-composition-stack-token");
      return createProductComposition([]);
    });

    render(<ProductApp compositionFactory={compositionFactory} />);

    expect(screen.getByRole("heading", { name: "검증된 응답을 읽지 못했습니다" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("private-composition-stack-token");
    const attemptsBeforeRetry = compositionFactory.mock.calls.length;
    expect(attemptsBeforeRetry).toBeGreaterThan(0);

    shouldFail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "화면 다시 열기" }));

    expect(compositionFactory.mock.calls.length).toBeGreaterThan(attemptsBeforeRetry);
    expect(screen.getByRole("heading", { name: "API 연결 계층을 검증하고 있습니다" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("creates one immutable composition per mounted runtime", () => {
    const compositionFactory = vi.fn(() => createProductComposition([]));
    const { rerender } = render(<ProductApp compositionFactory={compositionFactory} />);

    rerender(<ProductApp compositionFactory={compositionFactory} />);

    expect(compositionFactory).toHaveBeenCalledOnce();
  });
});
