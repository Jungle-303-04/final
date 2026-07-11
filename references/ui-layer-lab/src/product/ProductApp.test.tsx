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
  it("loads exactly one session in StrictMode and keeps unauthenticated navigation hidden", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not authenticated" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <StrictMode>
        <ProductApp />
      </StrictMode>,
    );

    expect(await screen.findByRole("heading", { name: "KubeHeal에 로그인" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).toBeNull();
  }, 15_000);

  it("keeps the authenticated zero-surface release gate shell-free", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        authenticated: true,
        user_id: "test-user",
        roles: ["viewer"],
        workspace_id: "test-workspace",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<ProductApp />);

    expect(await screen.findByRole("heading", {
      name: "API 연결 계층을 검증하고 있습니다",
    })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  }, 15_000);
});
