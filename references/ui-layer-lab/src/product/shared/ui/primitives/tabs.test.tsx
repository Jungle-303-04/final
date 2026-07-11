// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type TabsProps,
} from "./tabs";

afterEach(cleanup);

describe("product Tabs primitive", () => {
  it("renders canonical tab semantics while leaving headings to the screen", () => {
    const { container } = renderTabs();
    const root = container.querySelector<HTMLElement>('[data-slot="tabs"]');
    const list = screen.getByRole("tablist", { name: "리소스 상세" });
    const overview = screen.getByRole("tab", { name: "개요" });

    expect(root?.tagName).toBe("DIV");
    expect(root?.getAttribute("data-orientation")).toBe("horizontal");
    expect(list.getAttribute("data-slot")).toBe("tabs-list");
    expect(overview.tagName).toBe("BUTTON");
    expect(overview.getAttribute("type")).toBe("button");
    expect(overview.getAttribute("aria-selected")).toBe("true");
    expect(overview.hasAttribute("data-active")).toBe(true);
    expect(overview.tabIndex).toBe(0);
    expect(screen.getByRole("tabpanel", { name: "개요" }).tagName).toBe("DIV");
    expect(screen.getByRole("heading", { name: "리소스 상세" }).tagName).toBe("H2");
    expect(container.querySelectorAll("h1, h2, h3")).toHaveLength(1);
  });

  it("keeps a disabled tab inactive while roving to the next enabled tab", async () => {
    const user = userEvent.setup();
    renderTabs({ activationMode: "automatic", disabledEvents: true });
    const overview = screen.getByRole("tab", { name: "개요" });
    const events = screen.getByRole("tab", { name: "이벤트" });
    const yaml = screen.getByRole("tab", { name: "YAML" });

    overview.focus();
    await user.keyboard("{ArrowRight}");

    expect(document.activeElement).toBe(events);
    expect(events.getAttribute("aria-disabled")).toBe("true");
    expect(events.getAttribute("aria-selected")).toBe("false");
    expect(overview.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(yaml);
    expect(yaml.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "YAML" }).textContent).toContain("YAML 내용");
  });

  it("uses vertical roving focus and manual activation", async () => {
    const user = userEvent.setup();
    renderTabs({ activationMode: "manual", orientation: "vertical" });
    const overview = screen.getByRole("tab", { name: "개요" });
    const events = screen.getByRole("tab", { name: "이벤트" });

    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical");
    overview.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(events);
    expect(overview.getAttribute("aria-selected")).toBe("true");
    expect(events.getAttribute("aria-selected")).toBe("false");

    await user.keyboard("{Enter}");
    expect(events.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "이벤트" }).textContent)
      .toContain("이벤트 내용");
  });

  it("supports controlled and uncontrolled selection without optimistic state", async () => {
    const user = userEvent.setup();
    const onControlledChange = vi.fn();

    function ControlledTabs() {
      const [value, setValue] = useState<string | null>("overview");
      return (
        <>
          <output aria-label="현재 탭">{value}</output>
          <Tabs
            onValueChange={(nextValue) => {
              onControlledChange(nextValue);
              setValue(nextValue);
            }}
            value={value}
          >
            <TabsList aria-label="제어 탭">
              <TabsTrigger value="overview">개요</TabsTrigger>
              <TabsTrigger value="events">이벤트</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">개요 내용</TabsContent>
            <TabsContent value="events">이벤트 내용</TabsContent>
          </Tabs>
        </>
      );
    }

    const { unmount } = render(<ControlledTabs />);
    await user.click(screen.getByRole("tab", { name: "이벤트" }));
    expect(onControlledChange.mock.calls[0]?.[0]).toBe("events");
    expect(screen.getByRole("status", { name: "현재 탭" }).textContent).toContain("events");
    unmount();

    const onUncontrolledChange = vi.fn();
    renderTabs({ onValueChange: onUncontrolledChange });
    await user.click(screen.getByRole("tab", { name: "이벤트" }));
    expect(onUncontrolledChange.mock.calls[0]?.[0]).toBe("events");
    expect(onUncontrolledChange.mock.calls[0]?.[1]?.reason).toBe("none");
    expect(screen.getByRole("tabpanel", { name: "이벤트" }).hidden).toBe(false);
  });

  it("keeps current and keyboard focus distinguishable in accessibility modes", () => {
    renderTabs();
    const trigger = screen.getByRole("tab", { name: "개요" });

    expect(trigger.className).toContain("motion-reduce:transition-none");
    expect(trigger.className).toContain("forced-colors:data-active:bg-[Highlight]");
    expect(trigger.className).toContain("forced-colors:focus-visible:outline-[CanvasText]");
    expect(trigger.className).toContain("forced-colors:aria-disabled:text-[GrayText]");
  });

  it("protects canonical elements, roles, state, and orientation at runtime", () => {
    const unsafeRoot = {
      "data-orientation": "diagonal",
      "data-slot": "unsafe-root",
      defaultValue: "overview",
      orientation: "horizontal",
      render: <section data-testid="unsafe-root" />,
      role: "button",
      style: { display: "none" },
    } as unknown as TabsProps;

    const { container } = render(
      <Tabs {...unsafeRoot}>
        <h2 id="safe-tabs">안전한 탭</h2>
        <TabsList
          {...({ "aria-labelledby": "safe-tabs", role: "list" } as unknown as Parameters<typeof TabsList>[0])}
        >
          <TabsTrigger
            {...({ "data-active": "", role: "link", type: "submit", value: "overview" } as unknown as Parameters<typeof TabsTrigger>[0])}
          >
            개요
          </TabsTrigger>
        </TabsList>
        <TabsContent
          {...({ hidden: true, role: "none", tabIndex: -1, value: "overview" } as unknown as Parameters<typeof TabsContent>[0])}
        >
          안전한 내용
        </TabsContent>
      </Tabs>,
    );

    const root = container.querySelector<HTMLElement>('[data-slot="tabs"]');
    const tab = screen.getByRole("tab", { name: "개요" });
    const panel = screen.getByRole("tabpanel", { name: "개요" });
    expect(screen.queryByTestId("unsafe-root")).toBeNull();
    expect(root?.getAttribute("data-orientation")).toBe("horizontal");
    expect(root?.getAttribute("role")).toBeNull();
    expect(root?.style.display).not.toBe("none");
    expect(screen.getByRole("tablist").getAttribute("role")).toBe("tablist");
    expect(tab.getAttribute("type")).toBe("button");
    expect(panel.getAttribute("role")).toBe("tabpanel");
    expect(panel.tabIndex).toBe(0);
  });

  it.each([
    ["invalid orientation", { defaultValue: "overview", orientation: "diagonal" }],
    ["invalid activation", { activationMode: "instant", defaultValue: "overview" }],
    ["empty default", { defaultValue: "   " }],
    ["controlled without callback", { value: "overview" }],
    ["mixed selection", { defaultValue: "overview", onValueChange: vi.fn(), value: "events" }],
    ["invalid loop setting", { defaultValue: "overview", loopFocus: "yes" }],
  ])("rejects %s at runtime", (_label, unsafeProps) => {
    expect(() => render(
      <Tabs {...(unsafeProps as unknown as TabsProps)}>
        <TabsList aria-label="탭"><TabsTrigger value="overview">개요</TabsTrigger></TabsList>
        <TabsContent value="overview">내용</TabsContent>
      </Tabs>,
    )).toThrow();
  });

  it("rejects blank values, unnamed lists, and invalid composition at runtime", () => {
    expect(() => render(
      <Tabs defaultValue="overview">
        <TabsList {...({} as Parameters<typeof TabsList>[0])}>
          <TabsTrigger value="overview">개요</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">내용</TabsContent>
      </Tabs>,
    )).toThrow("TabsList requires exactly one accessible name");

    expect(() => render(
      <Tabs defaultValue="overview">
        <TabsList aria-label="탭">
          <TabsTrigger value="   ">개요</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">내용</TabsContent>
      </Tabs>,
    )).toThrow("TabsTrigger value must be a non-empty string");

    expect(() => render(
      <Tabs defaultValue="overview">
        <TabsTrigger value="overview">개요</TabsTrigger>
        <TabsContent value="overview">내용</TabsContent>
      </Tabs>,
    )).toThrow("TabsTrigger must be inside TabsList");

    expect(() => render(
      <Tabs defaultValue="overview">
        <TabsList aria-label="탭">
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsContent value="overview">내용</TabsContent>
        </TabsList>
      </Tabs>,
    )).toThrow("TabsContent cannot be inside TabsList");
  });
});

function renderTabs({
  activationMode = "automatic",
  disabledEvents = false,
  onValueChange,
  orientation = "horizontal",
}: {
  activationMode?: "automatic" | "manual";
  disabledEvents?: boolean;
  onValueChange?: (value: string | null) => void;
  orientation?: "horizontal" | "vertical";
} = {}) {
  return render(
    <Tabs
      activationMode={activationMode}
      defaultValue="overview"
      onValueChange={onValueChange}
      orientation={orientation}
    >
      <h2 id="resource-tabs-title">리소스 상세</h2>
      <TabsList aria-labelledby="resource-tabs-title">
        <TabsTrigger value="overview">개요</TabsTrigger>
        <TabsTrigger disabled={disabledEvents} value="events">이벤트</TabsTrigger>
        <TabsTrigger value="yaml">YAML</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">개요 내용</TabsContent>
      <TabsContent value="events">이벤트 내용</TabsContent>
      <TabsContent value="yaml">YAML 내용</TabsContent>
    </Tabs>,
  );
}

function assertTabsTypeContracts() {
  // @ts-expect-error uncontrolled Tabs require a default selection
  void <Tabs />;
  // @ts-expect-error controlled Tabs require an update callback
  void <Tabs value="overview" />;
  // @ts-expect-error controlled and uncontrolled values are exclusive
  void <Tabs defaultValue="overview" onValueChange={() => undefined} value="overview" />;
  // @ts-expect-error only canonical orientations are supported
  void <Tabs defaultValue="overview" orientation="diagonal" />;
  // @ts-expect-error loop focus is a boolean product decision
  void <Tabs defaultValue="overview" loopFocus="yes" />;
  // @ts-expect-error Base UI render cannot replace the product-owned root
  void <Tabs defaultValue="overview" render={<section />} />;
  // @ts-expect-error TabsList requires an accessible name
  void <TabsList />;
  // @ts-expect-error choose one accessible-name source
  void <TabsList aria-label="탭" aria-labelledby="tabs-title" />;
  // @ts-expect-error trigger values are required
  void <TabsTrigger>개요</TabsTrigger>;
  // @ts-expect-error canonical state is Base UI-owned
  void <TabsTrigger data-active="" value="overview">개요</TabsTrigger>;
  // @ts-expect-error panels retain tabpanel semantics
  void <TabsContent role="none" value="overview">내용</TabsContent>;
}

void assertTabsTypeContracts;
