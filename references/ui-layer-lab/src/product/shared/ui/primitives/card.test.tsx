// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

afterEach(cleanup);

describe("product-owned Card", () => {
  it("keeps title and description neutral so the screen owns heading hierarchy", () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle><h2>클러스터 상태</h2></CardTitle>
          <CardDescription><p>현재 선택 범위의 상태를 요약합니다.</p></CardDescription>
          <CardAction>새로 고침</CardAction>
        </CardHeader>
        <CardContent>상태 본문</CardContent>
        <CardFooter>마지막 확인 시각</CardFooter>
      </Card>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "클러스터 상태" })).toBeTruthy();
    expect(screen.getByText("현재 선택 범위의 상태를 요약합니다.").tagName).toBe("P");
    expect(container.querySelector('[data-slot="card-title"]')?.tagName).toBe("DIV");
    expect(container.querySelector('[data-slot="card-description"]')?.tagName).toBe("DIV");
    for (const slot of [
      "card",
      "card-header",
      "card-title",
      "card-description",
      "card-action",
      "card-content",
      "card-footer",
    ]) {
      expect(container.querySelector(`[data-slot="${slot}"]`)).toBeTruthy();
    }
  });

  it("merges consumer layout classes and forwards the supported size", () => {
    render(
      <Card className="max-w-md rounded-none" data-testid="card" size="sm">
        <CardHeader className="grid-cols-1" data-testid="header">
          <CardTitle className="truncate">노드 상태</CardTitle>
          <CardDescription className="max-w-sm">설명</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0" data-testid="content">본문</CardContent>
        <CardFooter className="justify-end" data-testid="footer">동작</CardFooter>
      </Card>,
    );

    const card = screen.getByTestId("card");
    expect(card.getAttribute("data-size")).toBe("sm");
    expect(card.className).toContain("max-w-md");
    expect(card.className).toContain("rounded-none");
    expect(card.className).not.toContain("rounded-xl");
    expect(screen.getByTestId("header").className).toContain("grid-cols-1");
    expect(screen.getByTestId("content").className).toContain("min-w-0");
    expect(screen.getByTestId("footer").className).toContain("justify-end");
  });

  it("preserves canonical slot and size attributes against unsafe runtime props", () => {
    const unsafeProps = {
      "data-size": "default",
      "data-slot": "not-a-card",
    } as unknown as Parameters<typeof Card>[0];

    render(<Card {...unsafeProps} data-testid="card-contract" size="sm" />);

    const card = screen.getByTestId("card-contract");
    expect(card.getAttribute("data-slot")).toBe("card");
    expect(card.getAttribute("data-size")).toBe("sm");
  });
});

function assertCardTypeContracts() {
  // @ts-expect-error Card supports only the canonical default and small sizes
  void <Card size="large">잘못된 크기</Card>;
  // @ts-expect-error canonical slot markers are component-owned
  void <Card data-slot="other">잘못된 슬롯</Card>;
  // @ts-expect-error canonical size markers are derived from the size prop
  void <Card data-size="sm">잘못된 크기 속성</Card>;
  // @ts-expect-error card part slot markers are component-owned
  void <CardTitle data-slot="other">잘못된 제목 슬롯</CardTitle>;
}

void assertCardTypeContracts;
