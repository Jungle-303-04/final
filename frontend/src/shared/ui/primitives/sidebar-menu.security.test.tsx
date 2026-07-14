// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { Fragment, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "./sidebar";
import {
  SidebarMenuButton,
  SidebarMenuLink,
  SidebarNavigation,
  type SidebarNavigationProps,
} from "./sidebar-menu";
import { TooltipProvider } from "./tooltip";

afterEach(cleanup);

describe("Sidebar menu runtime boundary", () => {
  it.each([
    ["current state", { "aria-current": "step" }],
    ["accessibility tree", { "aria-hidden": true }],
    ["active marker", { "data-active": "unsafe" }],
    ["disabled marker", { "aria-disabled": false }],
    ["capture bypass", { onClickCapture: vi.fn() }],
    ["tab order", { tabIndex: 0 }],
    ["inline style", { style: { display: "none" } }],
  ])("rejects a link %s override", (_label, unsafeProps) => {
    expect(() => renderLink(unsafeProps)).toThrow(/SidebarMenuLink does not accept/);
  });

  it.each([
    ["custom component", <UnsafeCustomLink key="custom" />],
    ["Fragment", <Fragment key="fragment"><a href="/">홈</a></Fragment>],
  ])("rejects an arbitrary %s render path", (_label, renderElement) => {
    expect(() => renderLink({ render: renderElement })).toThrow(
      /SidebarMenuLink does not accept render/,
    );
  });

  it("rejects polymorphic render injection into an action button", () => {
    expect(() => render(
      <SidebarProvider>
        <SidebarMenuButton
          {...({ render: <a href="/" /> } as unknown as Parameters<
            typeof SidebarMenuButton
          >[0])}
        >
          홈
        </SidebarMenuButton>
      </SidebarProvider>,
    )).toThrow(/SidebarMenuButton does not accept render/);
  });

  it("rejects page-current state on an action button", () => {
    expect(() => render(
      <SidebarProvider>
        <SidebarMenuButton
          {...({ isActive: true } as unknown as Parameters<
            typeof SidebarMenuButton
          >[0])}
        >
          새로 고침
        </SidebarMenuButton>
      </SidebarProvider>,
    )).toThrow(/SidebarMenuButton does not accept isActive/);
  });

  it.each([
    ["hidden navigation", { "aria-hidden": true }],
    ["editable navigation", { contentEditable: true }],
    ["drag navigation", { draggable: true }],
    ["tab stop", { tabIndex: 0 }],
    ["event handler", { onClick: vi.fn() }],
  ])("rejects a neutral %s bypass", (_label, unsafeProps) => {
    expect(() => render(
      <SidebarNavigation
        {...({
          "aria-label": "주요 메뉴",
          children: <span>메뉴</span>,
          ...unsafeProps,
        } as unknown as SidebarNavigationProps)}
      />,
    )).toThrow();
  });
});

function renderLink(unsafeProps: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <TooltipProvider delay={0}>
        <SidebarProvider>
          <SidebarMenuLink
            {...(unsafeProps as Parameters<typeof SidebarMenuLink>[0])}
            to="/"
            tooltip="홈"
          >
            홈
          </SidebarMenuLink>
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

function UnsafeCustomLink(): ReactElement {
  return <a href="/">홈</a>;
}
