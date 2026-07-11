// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  it("keeps the strict-mode zero-approval composition shell-free", () => {
    render(
      <StrictMode>
        <ProductApp />
      </StrictMode>,
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "API 연결 계층을 검증하고 있습니다" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
