// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { createProductComposition } from "./productComposition";
import { ProductRouter } from "./ProductRouter";
import { I18nProvider } from "../shared/i18n";
import type { AuthPort } from "../features/auth/authContract";
import type { GlobalFilterSuggestion } from "../features/global-filter/globalFilterContract";
import {
  installMatchMedia,
  renderShell,
  replaceProperty,
  testAuth,
  testClusterScope,
} from "./__tests__/ProductShellInteractionSupport";

const testAuthPort: AuthPort = {
  listWorkspaces: async () => ({ currentWorkspaceId: "test", items: [] }),
  loadSession: async () => ({ status: "unauthenticated" }),
  signIn: async () => { throw new Error("not used"); },
  signOut: async () => undefined,
  switchWorkspace: async () => { throw new Error("not used"); },
};

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
  it("opens active shortcut help from the toolbar and closes it with Escape", async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.queryByRole("dialog")).toBeNull();
    const trigger = screen.getByRole("button", { name: "키보드 단축키" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "키보드 단축키" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(dialog.textContent).toContain("홈 화면 열기");
    expect(dialog.textContent).toContain("인시던트 화면 열기");
    expect(dialog.textContent).toContain("Shift 키와 D 키");
    expect(dialog.textContent).not.toContain("토폴로지 화면 열기");
    expect(screen.getByRole("button", { name: "단축키 도움말 닫기" })).toBeTruthy();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
    expect(screen.getByRole("heading", { name: "인시던트", level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "인시던트" }).getAttribute("aria-current")).toBe("page");
    await waitFor(() => expect(document.activeElement?.id).toBe("product-main"));

    await user.keyboard("?");
    expect(screen.getByRole("dialog", { name: "키보드 단축키" })).toBeTruthy();
    await user.keyboard("?");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement?.id).toBe("product-main"));

    await user.keyboard("t");
    expect(window.localStorage.getItem("theme")).toBe("system");
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

  it("collapses the desktop rail without remounting links and exposes focus tooltips only when slim", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const sidebar = screen.getByRole("complementary", { name: "제품 메뉴" });
    const home = screen.getByRole("link", { name: "홈" });
    const collapse = screen.getByRole("button", { name: "사이드바 접기" });

    expect(sidebar.getAttribute("data-state")).toBe("expanded");
    await user.hover(home);
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.click(collapse);

    const expand = screen.getByRole("button", { name: "사이드바 펼치기" });
    expect(expand).toBe(collapse);
    expect(document.activeElement).toBe(expand);
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    expect(sidebar.getAttribute("data-state")).toBe("collapsed");
    expect(screen.getByRole("link", { name: "홈" })).toBe(home);
    expect(container.querySelectorAll("[data-slot='sidebar-menu-link']")).toHaveLength(2);

    home.focus();
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe("홈"));
  });

  it("keeps the workspace catalog on the top-left and account actions on the top-right", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    const workspaceTrigger = screen.getByRole("button", {
      name: "현재 워크스페이스: test-workspace",
    });
    const profileTrigger = screen.getByRole("button", { name: "test-use… 프로필 메뉴 열기" });
    expect(workspaceTrigger.closest('[data-slot="product-header-workspace"]')).toBeTruthy();
    expect(profileTrigger.closest('[data-slot="product-header-account"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="sidebar-footer"]')).toBeNull();

    await user.click(workspaceTrigger);
    expect(await screen.findByText(
      "접근 가능한 워크스페이스가 없습니다.",
    )).toBeTruthy();
    await user.keyboard("{Escape}");

    await user.click(profileTrigger);
    expect(screen.getByRole("link", { name: "프로필" }).getAttribute("href"))
      .toBe("/settings?clusters=cluster-1#profile");
    expect(screen.getByRole("link", { name: "설정" }).getAttribute("href"))
      .toBe("/settings?clusters=cluster-1");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
  });

  it("keeps the sidebar state independent from resource detail state", async () => {
    const user = userEvent.setup();
    const { container } = renderShell({
      initialEntry: "/resources?clusters=cluster-1&resources.types=pod" +
        "&detail=Pod%2Fshop%2Fcheckout-api-0",
      releasedSurfaceIds: new Set(["home", "resources"]),
    });
    const sidebar = screen.getByRole("complementary", { name: "제품 메뉴" });

    expect(sidebar.getAttribute("data-state")).toBe("expanded");
    expect(screen.getByRole("link", { name: "리소스" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "홈" })).toBeTruthy();
    expect(container.querySelectorAll("[data-slot='unified-filter-bar']")).toHaveLength(1);
    expect(sidebar.className).toContain("--motion-layout");
    expect(screen.getByText("Opsia").className.split(/\s+/u)).not.toContain("w-0");

    await user.click(screen.getByRole("link", { name: "홈" }));
    expect(sidebar.getAttribute("data-state")).toBe("expanded");
    expect(screen.getByText("Home content")).toBeTruthy();
  });

  it("uses a modal mobile drawer with Escape focus return and closes it after navigation", async () => {
    installMatchMedia(true);
    const user = userEvent.setup();
    renderShell();
    const open = screen.getByRole("button", { name: "모바일 사이드바 열기" });
    expect(screen.queryByRole("navigation", { name: "주요 메뉴" })).toBeNull();

    await user.click(open);
    const dialog = await screen.findByRole("dialog", { name: "제품 탐색" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(open);

    await user.click(open);
    await user.click(await screen.findByRole("link", { name: "인시던트" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Issue content")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "인시던트", level: 1 })).toBeTruthy();
  });

  it("lets Tab leave the non-modal mobile filter popup for the next header control", async () => {
    installMatchMedia(true);
    vi.stubGlobal("ResizeObserver", class {
      disconnect() {}
      observe() {}
      unobserve() {}
    });
    const user = userEvent.setup();
    try {
      renderShell();

      await user.click(screen.getByRole("button", { name: "클러스터, 앱, 라벨, 리소스 필터" }));
      expect(await screen.findByRole("dialog")).toBeTruthy();

      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "모든 필터 지우기" }));
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "현재 언어: 한국어" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the narrow header tab order aligned with its visual menu, controls, and filter rows", () => {
    installMatchMedia(true);
    const { container } = renderShell();
    const header = container.querySelector("header");
    if (!header) throw new Error("Product shell header is required");

    const tabOrder = Array.from(header.querySelectorAll<HTMLElement>("button, input"))
      .filter((element) => element.tabIndex >= 0 && !element.hasAttribute("disabled"))
      .map((element) => element.getAttribute("aria-label"));

    expect(tabOrder).toEqual([
      "모바일 사이드바 열기",
      "현재 워크스페이스: test-workspace",
      "클러스터, 앱, 라벨, 리소스 필터",
      "클러스터, 앱, 라벨, 리소스 필터",
      "모든 필터 지우기",
      "현재 언어: 한국어",
      "테마 선택",
      "키보드 단축키",
      "런타임 진단 열기",
      "test-use… 프로필 메뉴 열기",
    ]);
  });

  it("switches every shell label immediately from the locale control", async () => {
    const user = userEvent.setup();
    renderShell();

    const locale = screen.getByRole("combobox", { name: "현재 언어: 한국어" });
    await user.click(locale);
    await user.click(await screen.findByRole("option", { name: "영어" }));

    expect(screen.getByRole("combobox", { name: "Current language: English" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Incidents" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Choose theme" }));
    expect(screen.getByRole("button", { name: "Operating system" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dark" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Light" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Open profile menu for test-use…" }));
    expect(screen.getByRole("link", { name: "Profile" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Operating system" })).toBeNull();
    expect(window.localStorage.getItem("opsia.locale")).toBe("en");
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

      const releaseGateComposition = createProductComposition(
        [],
        testAuthPort,
        testClusterScope,
      );
      render(
        <I18nProvider navigatorLanguage="ko-KR" storage={null}>
          <MemoryRouter initialEntries={["/"]}>
            <ProductRouter auth={testAuth} composition={releaseGateComposition} />
          </MemoryRouter>
        </I18nProvider>,
      );
      expect(screen.getByRole("heading", { name: "서비스 연결을 확인하고 있습니다" })).toBeTruthy();
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
