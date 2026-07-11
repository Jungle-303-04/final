// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  type ButtonGroupProps,
} from "./button-group";

afterEach(cleanup);

describe("product-owned ButtonGroup", () => {
  it("groups native buttons without replacing their activation or disabled semantics", () => {
    const onRefresh = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <ButtonGroup aria-label="리소스 동작" orientation="horizontal">
        <Button onClick={onRefresh}>새로 고침</Button>
        <ButtonGroupSeparator />
        <Button disabled onClick={onDelete}>삭제</Button>
      </ButtonGroup>,
    );

    const group = screen.getByRole("group", { name: "리소스 동작" });
    const refresh = screen.getByRole("button", { name: "새로 고침" });
    const remove = screen.getByRole("button", { name: "삭제" });

    expect(group.getAttribute("data-slot")).toBe("button-group");
    expect(group.getAttribute("data-orientation")).toBe("horizontal");
    expect(group.className).toContain("border-l-0");
    expect(group.className).toContain("motion-reduce:");
    expect(group.className).toContain("forced-colors:");
    expect(refresh.tagName).toBe("BUTTON");
    expect(remove.hasAttribute("disabled")).toBe(true);
    fireEvent.click(refresh);
    fireEvent.click(remove);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(container.querySelector('[data-slot="button-group-separator"]')
      ?.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("supports a labelled vertical group and canonical text composition", () => {
    const { container } = render(
      <>
        <h2 id="view-modes">보기 방식</h2>
        <ButtonGroup aria-labelledby="view-modes" orientation="vertical">
          <ButtonGroupText id="current-mode">현재: 표</ButtonGroupText>
          <Button variant="outline">표</Button>
          <Button variant="outline">타일</Button>
          <ButtonGroupSeparator />
        </ButtonGroup>
      </>,
    );

    const group = screen.getByRole("group", { name: "보기 방식" });
    const text = screen.getByText("현재: 표");
    const separator = screen.getByRole("separator");

    expect(group.getAttribute("aria-label")).toBeNull();
    expect(group.getAttribute("aria-labelledby")).toBe("view-modes");
    expect(group.getAttribute("data-orientation")).toBe("vertical");
    expect(group.className).toContain("flex-col");
    expect(group.className).toContain("border-t-0");
    expect(text.getAttribute("data-slot")).toBe("button-group-text");
    expect(text.className).toContain("motion-reduce:transition-none");
    expect(text.className).toContain("forced-colors:border-[ButtonText]");
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
    expect(separator.className).toContain("forced-colors:bg-[ButtonText]");
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });

  it("derives separator direction and keeps slot-relative boundaries with neutral siblings", () => {
    const { container } = render(
      <ButtonGroup aria-label="혼합 동작" orientation="vertical">
        <span aria-hidden="true">장식</span>
        <Button variant="outline">첫 동작</Button>
        <ButtonGroupSeparator />
        <Button variant="outline">마지막 동작</Button>
        <span aria-hidden="true">후행 장식</span>
      </ButtonGroup>,
    );

    const group = screen.getByRole("group", { name: "혼합 동작" });
    const separator = screen.getByRole("separator");
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
    expect(group.className).toContain(":not(:has(~[data-slot]))");
    expect(group.className).toContain("[&>[data-slot]~[data-slot]]:border-t-0");
    expect(container.querySelectorAll("[data-slot]")).toHaveLength(4);
  });

  it("rejects missing, conflicting, blank names and unknown orientations", () => {
    expect(() => render(
      <ButtonGroup {...({ children: <Button>동작</Button> } as unknown as ButtonGroupProps)} />,
    )).toThrow("ButtonGroup requires exactly one accessible name");

    expect(() => render(
      <ButtonGroup
        {...({
          "aria-label": "동작",
          "aria-labelledby": "actions",
          children: <Button>동작</Button>,
        } as unknown as ButtonGroupProps)}
      />,
    )).toThrow("ButtonGroup requires exactly one accessible name");

    expect(() => render(
      <ButtonGroup aria-label="   "><Button>동작</Button></ButtonGroup>,
    )).toThrow("ButtonGroup accessible name must be non-empty");

    expect(() => render(
      <ButtonGroup
        {...({
          "aria-label": "동작",
          children: <Button>동작</Button>,
          orientation: "diagonal",
        } as unknown as ButtonGroupProps)}
      />,
    )).toThrow("ButtonGroup orientation must be horizontal or vertical");
  });

  it.each([
    ["click", { onClick: vi.fn() }],
    ["keyboard", { onKeyDown: vi.fn() }],
    ["role", { role: "toolbar" }],
    ["tab stop", { tabIndex: 0 }],
    ["raw render", { render: <section /> }],
    ["hidden group", { "aria-hidden": true }],
    ["raw HTML", { dangerouslySetInnerHTML: { __html: "unsafe" } }],
    ["inline style", { style: { display: "none" } }],
  ])("rejects a root %s semantics bypass", (_label, unsafeProps) => {
    expect(() => render(
      <ButtonGroup
        {...({
          "aria-label": "안전한 동작",
          children: <Button>동작</Button>,
          ...unsafeProps,
        } as unknown as ButtonGroupProps)}
      />,
    )).toThrow();
  });

  it("protects canonical root, text, and separator markers", () => {
    const { container } = render(
      <ButtonGroup
        {...({
          "aria-label": "리소스 동작",
          "data-orientation": "diagonal",
          "data-slot": "unsafe-group",
          children: (
            <>
              <ButtonGroupText
                {...({ "data-slot": "unsafe-text" } as unknown as Parameters<typeof ButtonGroupText>[0])}
              >
                선택됨
              </ButtonGroupText>
              <ButtonGroupSeparator
                {...({
                  "aria-orientation": "horizontal",
                  "data-orientation": "horizontal",
                  "data-slot": "unsafe-separator",
                } as unknown as Parameters<typeof ButtonGroupSeparator>[0])}
              />
            </>
          ),
          orientation: "horizontal",
        } as unknown as ButtonGroupProps)}
      />,
    );

    const group = screen.getByRole("group", { name: "리소스 동작" });
    expect(group.getAttribute("data-slot")).toBe("button-group");
    expect(group.getAttribute("data-orientation")).toBe("horizontal");
    expect(screen.getByText("선택됨").getAttribute("data-slot"))
      .toBe("button-group-text");
    const separator = container.querySelector('[data-slot="button-group-separator"]');
    expect(separator?.getAttribute("data-orientation")).toBe("vertical");
    expect(separator?.getAttribute("aria-orientation")).toBe("vertical");
  });

  it.each([
    ["text click", () => render(
      <ButtonGroupText
        {...({ onClick: vi.fn(), children: "텍스트" } as unknown as Parameters<typeof ButtonGroupText>[0])}
      />,
    )],
    ["text role", () => render(
      <ButtonGroupText
        {...({ role: "button", children: "텍스트" } as unknown as Parameters<typeof ButtonGroupText>[0])}
      />,
    )],
    ["separator render", () => render(
      <ButtonGroupSeparator
        {...({ render: <hr /> } as unknown as Parameters<typeof ButtonGroupSeparator>[0])}
      />,
    )],
    ["separator role", () => render(
      <ButtonGroupSeparator
        {...({ role: "presentation" } as unknown as Parameters<typeof ButtonGroupSeparator>[0])}
      />,
    )],
    ["orphan separator", () => render(<ButtonGroupSeparator />)],
  ])("rejects %s bypass", (_label, renderUnsafePart) => {
    expect(renderUnsafePart).toThrow();
  });
});

function assertButtonGroupTypeContracts() {
  void <ButtonGroup aria-label="동작"><Button>실행</Button></ButtonGroup>;
  void <ButtonGroup aria-labelledby="actions" orientation="vertical"><Button>실행</Button></ButtonGroup>;

  // @ts-expect-error an accessible name is required
  void <ButtonGroup><Button>실행</Button></ButtonGroup>;
  // @ts-expect-error accessible-name mechanisms are mutually exclusive
  void <ButtonGroup aria-label="동작" aria-labelledby="actions"><Button>실행</Button></ButtonGroup>;
  // @ts-expect-error only canonical orientations are supported
  void <ButtonGroup aria-label="동작" orientation="diagonal"><Button>실행</Button></ButtonGroup>;
  // @ts-expect-error the neutral root cannot own click behavior
  void <ButtonGroup aria-label="동작" onClick={() => undefined}><Button>실행</Button></ButtonGroup>;
  // @ts-expect-error the group role is component-owned
  void <ButtonGroup aria-label="동작" role="toolbar"><Button>실행</Button></ButtonGroup>;
  // @ts-expect-error the neutral root cannot enter the tab order
  void <ButtonGroup aria-label="동작" tabIndex={0}><Button>실행</Button></ButtonGroup>;
  // @ts-expect-error raw render cannot replace the product-owned root
  void <ButtonGroup aria-label="동작" render={<section />}><Button>실행</Button></ButtonGroup>;
  // @ts-expect-error a required accessible group cannot be hidden from the accessibility tree
  void <ButtonGroup aria-label="동작" aria-hidden><Button>실행</Button></ButtonGroup>;
  // @ts-expect-error canonical root orientation is derived from the prop
  void <ButtonGroup aria-label="동작" data-orientation="vertical"><Button>실행</Button></ButtonGroup>;
  // @ts-expect-error ButtonGroupText is a neutral non-clickable div
  void <ButtonGroupText onClick={() => undefined}>텍스트</ButtonGroupText>;
  // @ts-expect-error ButtonGroupSeparator owns native separator semantics
  void <ButtonGroupSeparator role="presentation" />;
  // @ts-expect-error separator direction is derived from the group
  void <ButtonGroupSeparator orientation="horizontal" />;
}

void assertButtonGroupTypeContracts;
