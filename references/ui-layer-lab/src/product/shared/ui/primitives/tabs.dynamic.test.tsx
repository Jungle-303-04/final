// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger, type TabsListProps } from "./tabs";

afterEach(cleanup);

describe("dynamic product Tabs contract", () => {
  it("converges to null when the last enabled uncontrolled tab disappears", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    function DynamicTabs() {
      const [visible, setVisible] = useState(true);
      return (
        <>
          <button onClick={() => setVisible(false)} type="button">탭 제거</button>
          <Tabs defaultValue="overview" onValueChange={onValueChange}>
            <TabsList aria-label="동적 탭">
              {visible ? <TabsTrigger value="overview">개요</TabsTrigger> : null}
            </TabsList>
            {visible ? <TabsContent value="overview">개요 내용</TabsContent> : null}
          </Tabs>
        </>
      );
    }

    render(<DynamicTabs />);
    await user.click(screen.getByRole("button", { name: "탭 제거" }));
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    const [value, details] = onValueChange.mock.calls[
      onValueChange.mock.calls.length - 1
    ] ?? [];
    expect(value).toBeNull();
    expect(details?.reason).toBe("missing");
  });

  it("supports an explicit no-selection controlled state", () => {
    render(
      <Tabs onValueChange={() => undefined} value={null}>
        <TabsList aria-label="선택 없음">
          <TabsTrigger value="overview">개요</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">개요 내용</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole("tab", { name: "개요" }).getAttribute("aria-selected"))
      .toBe("false");
    expect(screen.queryByRole("tabpanel", { name: "개요" })).toBeNull();
  });

  it("converges to null when the selected uncontrolled tab becomes disabled", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    function DisableAllTabs() {
      const [disabled, setDisabled] = useState(false);
      return (
        <>
          <button onClick={() => setDisabled(true)} type="button">탭 비활성화</button>
          <Tabs defaultValue="overview" onValueChange={onValueChange}>
            <TabsList aria-label="비활성화 탭">
              <TabsTrigger disabled={disabled} value="overview">개요</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">개요 내용</TabsContent>
          </Tabs>
        </>
      );
    }

    render(<DisableAllTabs />);
    await user.click(screen.getByRole("button", { name: "탭 비활성화" }));
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    const [value, details] = onValueChange.mock.calls[
      onValueChange.mock.calls.length - 1
    ] ?? [];
    expect(value).toBeNull();
    expect(details?.reason).toBe("disabled");
  });

  it("renders canonical default and line variants and rejects unknown variants", () => {
    const { rerender } = render(
      <Tabs defaultValue="overview">
        <TabsList aria-label="보기" variant="line">
          <TabsTrigger value="overview">개요</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">개요 내용</TabsContent>
      </Tabs>,
    );
    const list = screen.getByRole("tablist", { name: "보기" });
    expect(list.getAttribute("data-variant")).toBe("line");
    expect(list.className).toContain("bg-transparent");
    expect(screen.getByRole("tab", { name: "개요" }).className)
      .toContain("group-data-[variant=line]/tabs-list:data-active:after:opacity-100");

    rerender(
      <Tabs defaultValue="overview">
        <TabsList aria-label="보기">
          <TabsTrigger value="overview">개요</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">개요 내용</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole("tablist", { name: "보기" }).getAttribute("data-variant"))
      .toBe("default");

    expect(() => render(
      <Tabs defaultValue="overview">
        <TabsList {...({ "aria-label": "보기", variant: "pill" } as unknown as TabsListProps)}>
          <TabsTrigger value="overview">개요</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">개요 내용</TabsContent>
      </Tabs>,
    )).toThrow("TabsList variant must be default or line");
  });
});
