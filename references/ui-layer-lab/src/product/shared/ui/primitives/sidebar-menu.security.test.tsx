// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, NavLink } from "react-router-dom";
import { SidebarProvider } from "./sidebar";
import {
  SidebarMenuButton,
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
  ])("rejects a render element %s override", (_label, unsafeProps) => {
    expect(() => renderButton(
      <NavLink
        {...(unsafeProps as unknown as ComponentProps<typeof NavLink>)}
        aria-label="홈"
        to="/product"
      />,
    )).toThrow(/SidebarMenuButton render owns/);
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

function renderButton(renderElement: ReactElement) {
  return render(
    <MemoryRouter>
      <TooltipProvider delay={0}>
        <SidebarProvider>
          <SidebarMenuButton render={renderElement} tooltip="홈">
            홈
          </SidebarMenuButton>
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
}
