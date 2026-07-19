// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobalFilterSuggestion } from "../features/global-filter/globalFilterContract";
import {
  installMatchMedia,
  renderShell,
  replaceProperty,
} from "./__tests__/ProductShellInteractionSupport";

beforeEach(() => {
  installMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.className = "";
  window.localStorage.clear();
});

describe("ProductShell keyboard and help interaction", () => {
  it("opens active shortcut help from the profile utilities and closes it with Escape", async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.queryByRole("dialog", { name: "키보드 단축키" })).toBeNull();
    await openProfileUtilities(user);
    const trigger = screen.getByRole("button", { name: "키보드 단축키" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "키보드 단축키" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(dialog.textContent).toContain("홈 화면 열기");
    expect(dialog.textContent).toContain("이슈 화면 열기");
    expect(dialog.textContent).toContain("Shift 키와 D 키");
    expect(dialog.textContent).not.toContain("토폴로지 화면 열기");
    expect(screen.getByRole("button", { name: "단축키 도움말 닫기" })).toBeTruthy();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", {
      name: "키보드 단축키",
    })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("navigates with released route chords and toggles help with question mark", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    expect(container.querySelectorAll("[data-slot='unified-filter-bar']")).toHaveLength(1);
    expect(screen.getByRole("button", {
      name: "클러스터, 앱, 라벨, 리소스 필터",
    })).toBeTruthy();
    expect(screen.getByRole("button", {
      name: "클러스터 필터 cluster-1 제거",
    })).toBeTruthy();

    await user.keyboard("g");
    await user.keyboard("i");
    expect(screen.getByText("Issue content")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "이슈", level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "이슈" }).getAttribute("aria-current")).toBe("page");
    await waitFor(() => expect(document.activeElement?.id).toBe("product-main"));

    await user.keyboard("?");
    expect(screen.getByRole("dialog", { name: "키보드 단축키" })).toBeTruthy();
    await user.keyboard("?");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement?.id).toBe("product-main"));

    await user.keyboard("t");
    expect(window.localStorage.getItem("theme")).toBe("system");
    await openProfileUtilities(user);
    await user.click(screen.getByRole("button", { name: "테마 선택" }));
    expect(screen.getByRole("button", { name: "운영체제" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다크" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "라이트" })).toBeTruthy();
  });

  it("dispatches Resources actions and route chords from one shortcut authority", async () => {
    const user = userEvent.setup();
    renderShell({
      initialEntry: "/resources",
      releasedSurfaceIds: new Set(["home", "resources"]),
    });

    await user.keyboard("j");
    expect(screen.getByTestId("resources-shortcut").textContent).toBe("resources:next-row");
    await user.keyboard("G");
    expect(screen.getByTestId("resources-shortcut").textContent).toBe("resources:last-row");
    await user.keyboard("gg");
    expect(screen.getByTestId("resources-shortcut").textContent).toBe("resources:first-row");
    await user.keyboard("gh");
    await waitFor(() => expect(screen.getByText("Home content")).toBeTruthy());
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

  it("opens authenticated runtime diagnostics from Ctrl+Shift+D while an input owns focus", async () => {
    const user = userEvent.setup();
    renderShell();
    const input = screen.getByRole("textbox", { name: "화면 입력" });

    await user.click(input);
    await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}");

    expect(await screen.findByRole("dialog", { name: "런타임 진단" })).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(
      screen.queryByRole("dialog", { name: "런타임 진단" }),
    ).toBeNull());
  });

  it("opens namespace and cluster switchers from their single-key global shortcuts", async () => {
    vi.stubGlobal("ResizeObserver", class {
      disconnect() {}
      observe() {}
      unobserve() {}
    });
    const restoreScrollIntoView = replaceProperty(Element.prototype, "scrollIntoView", vi.fn());
    const user = userEvent.setup();
    try {
      renderShell({
        globalFilterPort: {
          search: vi.fn(async (): Promise<readonly GlobalFilterSuggestion[]> => [
            {
              type: "cluster",
              id: "cluster-1",
              label: "cluster-1",
              count: 1,
              count_completeness: "exact",
            },
            {
              type: "namespace",
              id: "cluster-1/shop",
              label: "shop",
              clusterId: "cluster-1",
              count: 3,
              count_completeness: "exact",
            },
          ]),
        },
      });

      await user.keyboard("n");
      expect(await screen.findByText("네임스페이스")).toBeTruthy();
      expect(screen.queryByText("클러스터")).toBeNull();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      document.getElementById("product-main")?.focus();

      await user.keyboard("c");
      expect(await screen.findByText("클러스터")).toBeTruthy();
      expect(screen.queryByText("네임스페이스")).toBeNull();
    } finally {
      restoreScrollIntoView();
      vi.unstubAllGlobals();
    }
  });

  it("focuses the current screen search with slash", async () => {
    vi.stubGlobal("ResizeObserver", class {
      disconnect() {}
      observe() {}
      unobserve() {}
    });
    const restoreScrollIntoView = replaceProperty(Element.prototype, "scrollIntoView", vi.fn());
    const user = userEvent.setup();
    try {
      renderShell();

      await user.keyboard("/");

      const input = screen.getByRole("textbox", {
        name: "클러스터, 앱, 라벨, 리소스 필터",
      });
      await waitFor(() => expect(document.activeElement).toBe(input));
    } finally {
      restoreScrollIntoView();
      vi.unstubAllGlobals();
    }
  });

  it("opens the descriptor-backed command palette and excludes the removed Topology route", async () => {
    vi.stubGlobal("ResizeObserver", class {
      disconnect() {}
      observe() {}
      unobserve() {}
    });
    const restoreScrollIntoView = replaceProperty(Element.prototype, "scrollIntoView", vi.fn());
    const user = userEvent.setup();
    try {
      renderShell();

      await user.keyboard("{Meta>}k{/Meta}");
      const dialog = await screen.findByRole("dialog", { name: "명령 팔레트" });
      expect(dialog.textContent).not.toContain("토폴로지");
      expect(dialog.textContent).toContain("준비되지 않음");
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "명령 팔레트" })).toBeNull());

      await user.keyboard("{Control>}k{/Control}");
      expect(await screen.findByRole("dialog", { name: "명령 팔레트" })).toBeTruthy();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "명령 팔레트" })).toBeNull());

      await user.keyboard("gt");
      expect(screen.getByText("Home content")).toBeTruthy();
      expect(screen.queryByText("토폴로지 화면은 아직 사용할 수 없습니다.")).toBeNull();
    } finally {
      restoreScrollIntoView();
      vi.unstubAllGlobals();
    }
  });

  it("switches every shell label immediately from the locale control", async () => {
    const user = userEvent.setup();
    renderShell();

    await openProfileUtilities(user);
    const locale = screen.getByRole("combobox", { name: "현재 언어: 한국어" });
    await user.click(locale);
    await user.click(await screen.findByRole("option", { name: "영어" }));

    await openProfileUtilities(user, "en");
    expect(screen.getByRole("combobox", { name: "Current language: English" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Incidents" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Choose theme" }));
    expect(screen.getByRole("button", { name: "Operating system" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dark" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Light" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await openProfileUtilities(user, "en");
    expect(screen.getByRole("link", { name: "Profile" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Operating system" })).toBeNull();
    expect(window.localStorage.getItem("opsia.locale")).toBe("en");
  });
});

async function openProfileUtilities(
  user: ReturnType<typeof userEvent.setup>,
  locale: "en" | "ko" = "ko",
) {
  const trigger = screen.getByRole("button", {
    name: locale === "ko"
      ? "test-use… 프로필 메뉴 열기"
      : "Open profile menu for test-use…",
  });
  if (trigger.getAttribute("aria-expanded") !== "true") await user.click(trigger);
  return screen.findByRole("group", {
    name: locale === "ko" ? "화면 및 진단 도구" : "Display and diagnostic tools",
  });
}
