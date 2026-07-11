// @vitest-environment jsdom

import { ThemeProvider } from "next-themes";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProductShell } from "./ProductShell";
import { createApiComposition } from "./apiComposition";
import { ProductRouter } from "./ProductRouter";

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
  vi.useRealTimers();
  document.documentElement.className = "";
  window.localStorage.clear();
});

describe("ProductShell keyboard and help interaction", () => {
  it("opens active shortcut help from the toolbar and closes it with Escape", async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.queryByRole("dialog")).toBeNull();
    const trigger = screen.getByRole("button", { name: "키보드 단축키" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "키보드 단축키" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(dialog.textContent).toContain("Home 화면 열기");
    expect(dialog.textContent).toContain("Issues 화면 열기");
    expect(dialog.textContent).not.toContain("Topology 화면 열기");
    expect(screen.getByRole("button", { name: "단축키 도움말 닫기" })).toBeTruthy();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("navigates with released route chords and toggles help with question mark", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.keyboard("g");
    await user.keyboard("i");
    expect(screen.getByText("Issue content")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Issues", level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Issues" }).getAttribute("aria-current")).toBe("page");
    await waitFor(() => expect(document.activeElement?.id).toBe("product-main"));

    await user.keyboard("?");
    expect(screen.getByRole("dialog", { name: "키보드 단축키" })).toBeTruthy();
    await user.keyboard("?");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement?.id).toBe("product-main"));

    await user.keyboard("t");
    expect(screen.getByRole("button", { name: "라이트 모드로 전환" })).toBeTruthy();
  });

  it("does not run global shortcuts while an editable control owns focus", async () => {
    const user = userEvent.setup();
    renderShell();
    const input = screen.getByRole("textbox", { name: "화면 입력" });

    await user.click(input);
    await user.keyboard("gi?");

    expect(screen.getByText("Home content")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("gi?");
  });

  it("keeps the production release gate shell-free and network-silent without API approvals", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    const webSocketSpy = vi.fn();
    const eventSourceSpy = vi.fn();
    const xhrSpy = vi.fn();
    const sendBeaconSpy = vi.fn();
    const restore = [
      replaceProperty(globalThis, "fetch", fetchSpy),
      replaceProperty(globalThis, "WebSocket", webSocketSpy),
      replaceProperty(globalThis, "EventSource", eventSourceSpy),
      replaceProperty(globalThis, "XMLHttpRequest", xhrSpy),
      replaceProperty(navigator, "sendBeacon", sendBeaconSpy),
    ];

    try {
      vi.resetModules();
      await Promise.all([import("./ProductRouter"), import("./apiComposition")]);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(webSocketSpy).not.toHaveBeenCalled();
      expect(eventSourceSpy).not.toHaveBeenCalled();
      expect(xhrSpy).not.toHaveBeenCalled();
      expect(sendBeaconSpy).not.toHaveBeenCalled();

      render(<ProductRouter composition={createApiComposition()} />);
      expect(screen.getByRole("heading", { name: "API 연결 계층을 검증하고 있습니다" })).toBeTruthy();
      expect(screen.queryByRole("navigation")).toBeNull();
      expect(screen.queryByRole("button", { name: "키보드 단축키" })).toBeNull();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("offline"));
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(300_000);
      await Promise.resolve();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(webSocketSpy).not.toHaveBeenCalled();
      expect(eventSourceSpy).not.toHaveBeenCalled();
      expect(xhrSpy).not.toHaveBeenCalled();
      expect(sendBeaconSpy).not.toHaveBeenCalled();
    } finally {
      restore.reverse().forEach((restoreProperty) => restoreProperty());
    }
  });
});

function renderShell() {
  return render(
    <StrictMode>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        themes={["light", "dark"]}
      >
        <MemoryRouter initialEntries={["/product"]}>
          <Routes>
            <Route element={<ProductShell releasedSurfaceIds={new Set(["home", "issues"])} />}>
              <Route path="/product" element={<><p>Home content</p><input aria-label="화면 입력" /></>} />
              <Route path="/product/issues" element={<p>Issue content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </StrictMode>,
  );
}

function replaceProperty(target: object, property: PropertyKey, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, {
    configurable: true,
    writable: true,
    value,
  });

  return () => {
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else Reflect.deleteProperty(target, property);
  };
}
