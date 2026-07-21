// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarText,
  SidebarTrigger,
  useSidebar,
  type SidebarProviderProps,
  type SidebarProps,
} from "./sidebar";

let media: ReturnType<typeof createMediaQuery>;

beforeEach(() => {
  media = createMediaQuery(false);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => media),
  });
});

afterEach(cleanup);

describe("product Sidebar primitive", () => {
  it("renders deterministic expanded desktop markup during SSR and by default", () => {
    const html = renderToString(<SidebarFixture />);
    expect(html).toContain('data-slot="sidebar-provider"');
    expect(html).toContain('data-state="expanded"');
    expect(html).toContain('aria-label="제품 메뉴"');
    expect(html).not.toContain('role="main"');

    const { container } = render(<SidebarFixture />);
    const sidebar = container.querySelector<HTMLElement>('[data-slot="sidebar"]');
    expect(sidebar?.tagName).toBe("ASIDE");
    expect(sidebar?.getAttribute("data-state")).toBe("expanded");
    expect(container.querySelector('[data-slot="sidebar-inset"]')?.tagName).toBe("DIV");
    expect(screen.getByText("Kyro").className).not.toContain("sr-only");
  });

  it("supports uncontrolled desktop state and keeps trigger focus", async () => {
    const user = userEvent.setup();
    render(<SidebarFixture defaultOpen={false} />);
    const trigger = screen.getByRole("button", { name: "사이드바 펼치기" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("collapsed").textContent).toBe("collapsed");

    await user.click(trigger);
    expect(screen.getByRole("button", { name: "사이드바 접기" }).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByText("Kyro").className).not.toContain("sr-only");
  });

  it("supports controlled desktop and mobile state without optimistic mutation", async () => {
    const user = userEvent.setup();
    const desktopChange = vi.fn();
    const mobileChange = vi.fn();
    render(
      <SidebarProvider
        mobileOpen={false}
        onMobileOpenChange={mobileChange}
        onOpenChange={desktopChange}
        open={false}
      >
        <ContextProbe />
        <SidebarFixtureBody />
      </SidebarProvider>,
    );

    await user.click(screen.getByRole("button", { name: "사이드바 펼치기" }));
    expect(desktopChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "사이드바 펼치기" }).getAttribute("aria-expanded")).toBe("false");

    act(() => media.setMatches(true));
    await waitFor(() => expect(screen.getByText("mobile").textContent).toBe("mobile"));
    await user.click(screen.getByRole("button", { name: "모바일 사이드바 열기" }));
    expect(mobileChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("subscribes to the 767px media query and keeps desktop/mobile states independent", async () => {
    const { unmount } = render(<SidebarFixture defaultOpen={false} defaultMobileOpen />);
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
    expect(media.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    act(() => media.setMatches(true));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "제품 탐색" })).toBeTruthy());
    expect(document.querySelector('[data-slot="sidebar-trigger"]')?.getAttribute("aria-expanded")).toBe("true");

    act(() => media.setMatches(false));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "사이드바 펼치기" }).getAttribute("aria-expanded")).toBe("false");
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("uses the product Dialog as a left mobile drawer with focus trap, Escape, and focus return", async () => {
    media.matches = true;
    const user = userEvent.setup();
    render(<SidebarFixture />);
    await waitFor(() => expect(screen.getByText("mobile").textContent).toBe("mobile"));
    const trigger = screen.getByRole("button", { name: "모바일 사이드바 열기" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "제품 탐색" });
    expect(dialog.getAttribute("data-slot")).toBe("dialog-content");
    expect(dialog.className).toContain("left-0");
    expect(dialog.className).toContain("motion-reduce:duration-0");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const close = screen.getByRole("button", { name: "모바일 사이드바 닫기" });
    close.focus();
    await user.tab();
    expect(
      dialog.contains(document.activeElement)
      || document.activeElement?.getAttribute("data-base-ui-focus-guard") === "",
    ).toBe(true);
    expect(document.activeElement).not.toBe(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("requires one accessible name and localized mobile copy", () => {
    expect(() => render(<SidebarFixture omitName />)).toThrow("Sidebar requires exactly one accessible name");
    expect(() => render(<SidebarFixture duplicateName />)).toThrow("Sidebar requires exactly one accessible name");
    expect(() => render(<SidebarFixture mobileTitle=" " />)).toThrow("Sidebar mobileTitle must be non-empty");
    expect(() => render(<SidebarFixture expandLabel=" " />)).toThrow("SidebarTrigger labels must be non-empty");
  });

  it("protects canonical slots, roles, state, controls, and styling at runtime", () => {
    const unsafeSidebar = {
      "aria-label": "제품 메뉴",
      "data-slot": "unsafe",
      "data-state": "collapsed",
      mobileCloseLabel: "모바일 사이드바 닫기",
      mobileDescription: "모바일 제품 메뉴입니다.",
      mobileTitle: "제품 탐색",
      role: "main",
      style: { display: "none" },
    } as unknown as SidebarProps;
    const { container } = render(
      <SidebarProvider {...({ defaultOpen: true, role: "main", style: { display: "none" } } as unknown as SidebarProviderProps)}>
        <Sidebar {...unsafeSidebar}><SidebarHeader {...({ "data-slot": "unsafe", role: "banner" } as unknown as Parameters<typeof SidebarHeader>[0])}>머리말</SidebarHeader></Sidebar>
        <SidebarTrigger
          {...({ "aria-controls": "wrong", "aria-expanded": false, role: "link", type: "submit" } as unknown as Parameters<typeof SidebarTrigger>[0])}
          collapseLabel="사이드바 접기"
          controls="product-navigation"
          expandLabel="사이드바 펼치기"
          labelMode="sr-only"
          mobileCloseLabel="모바일 사이드바 닫기"
          mobileOpenLabel="모바일 사이드바 열기"
        />
      </SidebarProvider>,
    );
    const provider = container.querySelector<HTMLElement>('[data-slot="sidebar-provider"]');
    const sidebar = screen.getByRole("complementary", { name: "제품 메뉴" });
    const trigger = screen.getByRole("button", { name: "사이드바 접기" });
    expect(provider?.getAttribute("role")).toBeNull();
    expect(provider?.style.display).not.toBe("none");
    expect(sidebar.getAttribute("data-slot")).toBe("sidebar");
    expect(sidebar.getAttribute("role")).toBeNull();
    expect(sidebar.style.display).not.toBe("none");
    expect(container.querySelector('[data-slot="sidebar-header"]')?.getAttribute("role")).toBeNull();
    expect(trigger.getAttribute("aria-controls")).toBe("product-navigation");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("type")).toBe("button");
    expect(trigger.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(trigger.querySelector('[data-slot="sidebar-text"]')?.className).toContain("sr-only");
    expect(trigger.className).toContain("forced-colors:focus-visible:outline");
  });

  it("rejects mixed control modes and use outside its provider", () => {
    expect(() => render(<ContextProbe />)).toThrow("useSidebar must be inside SidebarProvider");
    expect(() => render(
      <SidebarProvider {...({ defaultOpen: true, onOpenChange: vi.fn(), open: true } as unknown as SidebarProviderProps)} />,
    )).toThrow("SidebarProvider desktop state must be controlled or uncontrolled");
    expect(() => render(
      <SidebarProvider {...({ defaultMobileOpen: true, mobileOpen: true, onMobileOpenChange: vi.fn() } as unknown as SidebarProviderProps)} />,
    )).toThrow("SidebarProvider mobile state must be controlled or uncontrolled");
  });
});

function SidebarFixture({
  defaultMobileOpen,
  defaultOpen,
  duplicateName,
  expandLabel = "사이드바 펼치기",
  mobileTitle = "제품 탐색",
  omitName,
}: {
  defaultMobileOpen?: boolean;
  defaultOpen?: boolean;
  duplicateName?: boolean;
  expandLabel?: string;
  mobileTitle?: string;
  omitName?: boolean;
} = {}) {
  return (
    <SidebarProvider defaultMobileOpen={defaultMobileOpen} defaultOpen={defaultOpen}>
      <ContextProbe />
      <SidebarFixtureBody duplicateName={duplicateName} mobileTitle={mobileTitle} omitName={omitName} expandLabel={expandLabel} />
      <SidebarInset>본문</SidebarInset>
    </SidebarProvider>
  );
}

function SidebarFixtureBody({ duplicateName, expandLabel = "사이드바 펼치기", mobileTitle = "제품 탐색", omitName }: { duplicateName?: boolean; expandLabel?: string; mobileTitle?: string; omitName?: boolean } = {}) {
  const nameProps = omitName ? {} : duplicateName ? { "aria-label": "제품 메뉴", "aria-labelledby": "menu-title" } : { "aria-label": "제품 메뉴" };
  return <>
    <Sidebar {...(nameProps as unknown as SidebarProps)} id="product-navigation" mobileCloseLabel="모바일 사이드바 닫기" mobileDescription="모바일 제품 메뉴입니다." mobileTitle={mobileTitle}>
      <SidebarHeader><SidebarText>Kyro</SidebarText></SidebarHeader>
      <SidebarContent><button type="button">메뉴 동작</button></SidebarContent>
      <SidebarFooter>바닥글</SidebarFooter>
    </Sidebar>
    <SidebarTrigger collapseLabel="사이드바 접기" controls="product-navigation" expandLabel={expandLabel} mobileCloseLabel="모바일 사이드바 닫기" mobileOpenLabel="모바일 사이드바 열기" />
  </>;
}

function ContextProbe() {
  const context = useSidebar();
  return <output><span>{context.state}</span><span>{context.isMobile ? "mobile" : "desktop"}</span><span>{context.currentOpen ? "open" : "closed"}</span></output>;
}

function createMediaQuery(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  return {
    matches: initial,
    media: "(max-width: 767px)",
    onchange: null,
    addEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    setMatches(next: boolean) {
      this.matches = next;
      const event = { matches: next, media: this.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function assertSidebarTypes() {
  // @ts-expect-error controlled desktop state requires its callback
  void <SidebarProvider open />;
  // @ts-expect-error controlled and uncontrolled desktop state are exclusive
  void <SidebarProvider defaultOpen open onOpenChange={() => undefined} />;
  // @ts-expect-error controlled mobile state requires its callback
  void <SidebarProvider mobileOpen />;
  // @ts-expect-error Sidebar requires exactly one accessible name
  void <Sidebar mobileCloseLabel="닫기" mobileDescription="설명" mobileTitle="제목" />;
  // @ts-expect-error trigger labels are product-owned required inputs
  void <SidebarTrigger controls="navigation" />;
  // @ts-expect-error trigger controls are component-owned
  void <SidebarTrigger aria-controls="other" collapseLabel="접기" controls="navigation" expandLabel="펼치기" mobileCloseLabel="닫기" mobileOpenLabel="열기" />;
  // @ts-expect-error label visibility is a closed product contract
  void <SidebarTrigger collapseLabel="접기" controls="navigation" expandLabel="펼치기" labelMode="hidden" mobileCloseLabel="닫기" mobileOpenLabel="열기" />;
}

void assertSidebarTypes;
