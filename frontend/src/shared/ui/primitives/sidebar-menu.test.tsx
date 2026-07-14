// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider, useSidebar } from "./sidebar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuLink,
  SidebarNavigation,
  type SidebarNavigationProps,
} from "./sidebar-menu";
import { TooltipProvider } from "./tooltip";

let isMobile = false;

beforeEach(() => {
  isMobile = false;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: isMobile,
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(cleanup);

describe("product-owned Sidebar menu", () => {
  it("preserves nav, list, item, and NavLink anchor semantics", () => {
    const { container } = renderMenu({ defaultOpen: true, active: true });

    const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
    const list = screen.getByRole("list");
    const item = screen.getByRole("listitem");
    const link = screen.getByRole("link", { name: "홈" });

    expect(navigation.id).toBe("product-primary-navigation");
    expect(navigation.getAttribute("data-slot")).toBe("sidebar-navigation");
    expect(list.tagName).toBe("UL");
    expect(list.getAttribute("data-slot")).toBe("sidebar-menu");
    expect(item.tagName).toBe("LI");
    expect(item.getAttribute("data-slot")).toBe("sidebar-menu-item");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.hasAttribute("data-active")).toBe(true);
    expect(link.getAttribute("data-sidebar-state")).toBe("expanded");
    expect(container.querySelector("button")).toBeNull();
  });

  it("shows a tooltip on collapsed desktop hover and keyboard focus only", async () => {
    const user = userEvent.setup();
    const collapsed = renderMenu({ defaultOpen: false, active: false });
    const link = screen.getByRole("link", { name: "홈" });

    expect(link.getAttribute("data-sidebar-state")).toBe("collapsed");
    expect(link.className).toContain("data-[sidebar-state=collapsed]");
    await user.hover(link);
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe("홈"));
    await user.unhover(link);
    await user.tab();
    expect(document.activeElement).toBe(link);
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe("홈"));
    collapsed.unmount();

    renderMenu({ defaultOpen: true, active: false });
    const expandedLink = screen.getByRole("link", { name: "홈" });
    await user.hover(expandedLink);
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.tab();
    expect(document.activeElement).toBe(expandedLink);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("prevents disabled menu links from activation and the tab order", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderMenu({ defaultOpen: false, disabled: true, onClick });
    const link = screen.getByRole("link", { name: "홈" });

    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.getAttribute("tabindex")).toBe("-1");
    expect(link.hasAttribute("disabled")).toBe(false);
    expect(link.getAttribute("data-disabled")).toBe("");
    await user.click(link);
    expect(onClick).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
  });

  it("uses a non-submitting native button when no render override is provided", () => {
    render(
      <SidebarProvider>
        <SidebarNavigation aria-label="동작 메뉴">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="새로 고침">새로 고침</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarNavigation>
      </SidebarProvider>,
    );
    expect(screen.getByRole("button", { name: "새로 고침" }).getAttribute("type"))
      .toBe("button");
  });

  it("closes an open mobile drawer after an enabled menu activation", async () => {
    isMobile = true;
    const user = userEvent.setup();
    renderMenu({ defaultOpen: true, defaultMobileOpen: true });

    await waitFor(() => expect(screen.getByTestId("mobile-open").textContent).toBe("open"));
    await user.click(screen.getByRole("link", { name: "홈" }));
    await waitFor(() => expect(screen.getByTestId("mobile-open").textContent).toBe("closed"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("requires exactly one non-empty navigation accessible name", () => {
    expect(() => render(
      <SidebarNavigation {...({ children: <SidebarMenu /> } as unknown as SidebarNavigationProps)} />,
    )).toThrow("SidebarNavigation requires exactly one accessible name");

    expect(() => render(
      <SidebarNavigation
        {...({
          "aria-label": "메뉴",
          "aria-labelledby": "menu-title",
          children: <SidebarMenu />,
        } as unknown as SidebarNavigationProps)}
      />,
    )).toThrow("SidebarNavigation requires exactly one accessible name");

    expect(() => render(
      <SidebarNavigation aria-label="   "><SidebarMenu /></SidebarNavigation>,
    )).toThrow("SidebarNavigation accessible name must be non-empty");
  });

  it("protects canonical semantics and provides reduced-motion and forced-color states", () => {
    renderMenu({ active: true });
    const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
    const link = screen.getByRole("link", { name: "홈" });

    expect(navigation.getAttribute("data-slot")).toBe("sidebar-navigation");
    expect(link.getAttribute("data-slot")).toBe("sidebar-menu-link");
    expect(link.getAttribute("data-sidebar-state")).toBe("expanded");
    expect(link.getAttribute("data-active")).toBe("");
    expect(link.className).toContain("motion-reduce:transition-none");
    expect(link.className).toContain("forced-colors:data-active:bg-[Highlight]");
    expect(link.className).toContain("forced-colors:data-active:text-[HighlightText]");
    expect(link.className).toContain("forced-colors:focus-visible:outline-[CanvasText]");
    expect(link.className).toContain("forced-colors:aria-disabled:text-[GrayText]");
    expect(link.className).toContain("forced-colors:aria-disabled:opacity-100");
  });

  it.each([
    ["role", { role: "presentation" }],
    ["inline style", { style: { display: "none" } }],
    ["raw HTML", { dangerouslySetInnerHTML: { __html: "unsafe" } }],
    ["canonical slot", { "data-slot": "unsafe" }],
  ])("rejects a navigation %s bypass", (_label, unsafeProps) => {
    expect(() => render(
      <SidebarNavigation
        {...({
          "aria-label": "주요 메뉴",
          children: <SidebarMenu />,
          ...unsafeProps,
        } as unknown as SidebarNavigationProps)}
      />,
    )).toThrow();
  });
});

type RenderMenuOptions = {
  active?: boolean;
  buttonProps?: Record<string, unknown>;
  defaultMobileOpen?: boolean;
  defaultOpen?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

function renderMenu({
  active = false,
  buttonProps,
  defaultMobileOpen = false,
  defaultOpen = true,
  disabled = false,
  onClick,
}: RenderMenuOptions = {}) {
  return render(
    <MemoryRouter initialEntries={[active ? "/" : "/elsewhere"]}>
      <TooltipProvider delay={0}>
        <SidebarProvider defaultMobileOpen={defaultMobileOpen} defaultOpen={defaultOpen}>
          <SidebarNavigation aria-label="주요 메뉴" id="product-primary-navigation">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuLink
                  {...(buttonProps as Parameters<typeof SidebarMenuLink>[0])}
                  disabled={disabled}
                  isActive={active}
                  onClick={onClick}
                  to="/"
                  tooltip="홈"
                >
                  <svg aria-hidden="true" />
                  <span>홈</span>
                </SidebarMenuLink>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarNavigation>
          <MobileState />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

function MobileState() {
  const { currentOpen, isMobile } = useSidebar();
  return (
    <output data-testid="mobile-open">
      {isMobile && currentOpen ? "open" : "closed"}
    </output>
  );
}

function assertSidebarMenuTypeContracts() {
  void <SidebarNavigation aria-label="주요 메뉴"><SidebarMenu /></SidebarNavigation>;
  void <SidebarNavigation aria-labelledby="menu-title"><SidebarMenu /></SidebarNavigation>;
  // @ts-expect-error an accessible navigation name is required
  void <SidebarNavigation><SidebarMenu /></SidebarNavigation>;
  // @ts-expect-error accessible-name mechanisms are mutually exclusive
  void <SidebarNavigation aria-label="메뉴" aria-labelledby="menu-title"><SidebarMenu /></SidebarNavigation>;
  // @ts-expect-error native navigation semantics are component-owned
  void <SidebarNavigation aria-label="메뉴" role="presentation"><SidebarMenu /></SidebarNavigation>;
  void <SidebarMenuLink to="/">홈</SidebarMenuLink>;
  // @ts-expect-error arbitrary render elements are forbidden
  void <SidebarMenuLink render={<span />} to="/">홈</SidebarMenuLink>;
  // @ts-expect-error route targets must be strings
  void <SidebarMenuLink to={{ pathname: "/" }}>홈</SidebarMenuLink>;
  // @ts-expect-error action buttons cannot become polymorphic links
  void <SidebarMenuButton render={<a href="/" />}>홈</SidebarMenuButton>;
  // @ts-expect-error page-current state belongs to navigation links
  void <SidebarMenuButton isActive>새로 고침</SidebarMenuButton>;
}

void assertSidebarMenuTypeContracts;
