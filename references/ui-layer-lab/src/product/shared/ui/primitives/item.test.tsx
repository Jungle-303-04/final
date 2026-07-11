// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  type ItemProps,
} from "./item";

afterEach(cleanup);

describe("product-owned Item", () => {
  it("renders the canonical family while leaving heading hierarchy to the screen", () => {
    const { container } = render(
      <div role="list">
        <ItemGroup>
          <Item as="div" role="listitem" size="sm" variant="outline">
            <ItemMedia variant="icon" aria-hidden="true">
              <svg />
            </ItemMedia>
            <ItemContent>
              <ItemHeader>
                <ItemTitle>worker-01</ItemTitle>
                <ItemActions>정상</ItemActions>
              </ItemHeader>
              <ItemDescription>노드에서 실행 중인 파드입니다.</ItemDescription>
              <ItemFooter>방금 갱신됨</ItemFooter>
            </ItemContent>
          </Item>
          <ItemSeparator />
        </ItemGroup>
      </div>,
    );

    expect(container.querySelector('[data-slot="item-group"]')?.getAttribute("role")).toBeNull();
    expect(screen.getByRole("listitem").getAttribute("data-size")).toBe("sm");
    expect(screen.getByRole("listitem").getAttribute("data-variant")).toBe("outline");
    expect(screen.getByText("worker-01").tagName).toBe("DIV");
    expect(screen.getByText("노드에서 실행 중인 파드입니다.").tagName).toBe("P");

    for (const slot of [
      "item-group",
      "item",
      "item-media",
      "item-content",
      "item-header",
      "item-title",
      "item-actions",
      "item-description",
      "item-footer",
      "item-separator",
    ]) {
      expect(container.querySelector(`[data-slot="${slot}"]`)).toBeTruthy();
    }
  });

  it("renders navigation as an anchor with a required destination", () => {
    render(
      <Item
        as="a"
        className="max-w-md rounded-none"
        href="/product/resources/pods"
        size="xs"
        variant="muted"
      >
        <ItemContent>
          <ItemTitle>파드 보기</ItemTitle>
        </ItemContent>
      </Item>,
    );

    const link = screen.getByRole("link", { name: "파드 보기" });
    expect(link.getAttribute("href")).toBe("/product/resources/pods");
    expect(link.getAttribute("data-size")).toBe("xs");
    expect(link.getAttribute("data-variant")).toBe("muted");
    expect(link.className).toContain("max-w-md");
    expect(link.className).toContain("rounded-none");
    expect(link.className).not.toContain("rounded-lg");
  });

  it("renders actions as a native button with a fixed safe type", () => {
    const onClick = vi.fn();

    render(
      <Item as="button" disabled={false} onClick={onClick}>
        다시 시도
      </Item>,
    );

    const button = screen.getByRole("button", { name: "다시 시도" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("forced-colors:disabled:opacity-100");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps canonical slot, variant, and size markers component-owned", () => {
    const unsafeProps = {
      as: "a",
      "data-size": "default",
      "data-slot": "not-an-item",
      "data-variant": "default",
      href: "/product/issues",
      size: "sm",
      variant: "outline",
    } as unknown as ItemProps;

    render(<Item {...unsafeProps}>인시던트 보기</Item>);

    const link = screen.getByRole("link", { name: "인시던트 보기" });
    expect(link.getAttribute("data-slot")).toBe("item");
    expect(link.getAttribute("data-size")).toBe("sm");
    expect(link.getAttribute("data-variant")).toBe("outline");
  });

  it.each([
    ["clickable div", { as: "div", onClick: vi.fn() }],
    ["focusable div", { as: "div", tabIndex: 0 }],
    ["button-role div", { as: "div", role: "button" }],
    ["unknown-role div", { as: "div", role: "checkbox" }],
    ["unnamed-region div", { as: "div", role: "region" }],
    ["anchor without a destination", { as: "a", href: "   " }],
    ["link role override", { as: "a", href: "/product", role: "button" }],
    ["button with a caller-owned type", { as: "button", type: "submit" }],
    ["button role override", { as: "button", role: "link" }],
    ["unknown element", { as: "span" }],
    ["unknown variant", { as: "div", variant: "ghost" }],
    ["unknown size", { as: "div", size: "lg" }],
  ])("rejects unsafe runtime props for %s", (_label, unsafeProps) => {
    expect(() =>
      render(
        <Item {...(unsafeProps as unknown as ItemProps)}>
          잘못된 항목
        </Item>,
      ),
    ).toThrow();
  });

  it.each([
    ["role", { role: "list" }],
    ["click behavior", { onClick: vi.fn() }],
    ["tab stop", { tabIndex: 0 }],
  ])("rejects ItemGroup runtime attempts to own %s", (_label, unsafeProps) => {
    expect(() =>
      render(
        <ItemGroup {...(unsafeProps as unknown as ComponentProps<typeof ItemGroup>)}>
          안전한 항목 그룹
        </ItemGroup>,
      ),
    ).toThrow();
  });
});

function assertItemTypeContracts() {
  void <Item role="listitem">중립 항목</Item>;
  void <Item as="a" href="/product/resources">리소스</Item>;
  void <Item as="button" onClick={() => undefined}>새로 고침</Item>;

  // @ts-expect-error a div cannot own click behavior
  void <Item onClick={() => undefined}>클릭 가능한 div</Item>;
  // @ts-expect-error a div cannot enter the tab order
  void <Item tabIndex={0}>포커스 가능한 div</Item>;
  // @ts-expect-error a div cannot imitate a button
  void <Item role="button">버튼 역할 div</Item>;
  // @ts-expect-error an anchor requires a navigation destination
  void <Item as="a">목적지 없는 링크</Item>;
  // @ts-expect-error links retain native link semantics
  void <Item as="a" href="/product" role="button">잘못된 링크 역할</Item>;
  // @ts-expect-error button type is fixed by Item
  void <Item as="button" type="submit">제출</Item>;
  // @ts-expect-error buttons retain native button semantics
  void <Item as="button" role="link">잘못된 버튼 역할</Item>;
  // @ts-expect-error only div, anchor, and button roots are supported
  void <Item as="span">지원하지 않는 요소</Item>;
  // @ts-expect-error Item supports only canonical visual variants
  void <Item variant="ghost">지원하지 않는 변형</Item>;
  // @ts-expect-error Item supports only canonical density sizes
  void <Item size="lg">지원하지 않는 크기</Item>;
  // @ts-expect-error canonical slot markers are component-owned
  void <Item data-slot="other">잘못된 슬롯</Item>;
  // @ts-expect-error canonical variant markers are derived from variant
  void <Item data-variant="outline">잘못된 변형 속성</Item>;
  // @ts-expect-error canonical size markers are derived from size
  void <Item data-size="sm">잘못된 크기 속성</Item>;
  // @ts-expect-error ItemMedia supports only its canonical variants
  void <ItemMedia variant="avatar">잘못된 미디어 변형</ItemMedia>;
  // @ts-expect-error canonical part slot markers are component-owned
  void <ItemTitle data-slot="other">잘못된 제목 슬롯</ItemTitle>;
  // @ts-expect-error ItemGroup leaves list semantics to an external owner
  void <ItemGroup role="list">잘못된 목록 소유자</ItemGroup>;
  // @ts-expect-error ItemGroup is a neutral layout and cannot own click behavior
  void <ItemGroup onClick={() => undefined}>클릭 가능한 그룹</ItemGroup>;
  // @ts-expect-error ItemGroup cannot enter the tab order
  void <ItemGroup tabIndex={0}>포커스 가능한 그룹</ItemGroup>;
}

void assertItemTypeContracts;
