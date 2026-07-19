// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";

afterEach(cleanup);

describe("product-owned Button", () => {
  it("keeps native semantics and accessible visual-state contracts", () => {
    render(
      <Button className="w-full" disabled variant="outline">
        실행
      </Button>,
    );

    const button = screen.getByRole("button", { name: "실행" });
    expect(button.getAttribute("data-slot")).toBe("button");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.className).toContain("w-full");
    for (const className of [
      "focus-visible:border-ring",
      "focus-visible:ring-3",
      "focus-visible:ring-ring/50",
      "disabled:pointer-events-none",
      "disabled:opacity-50",
      "motion-reduce:transition-none",
      "forced-colors:disabled:border-[GrayText]",
      "forced-colors:disabled:text-[GrayText]",
      "forced-colors:disabled:opacity-100",
      "forced-colors:focus-visible:outline",
      "forced-colors:focus-visible:outline-2",
      "forced-colors:focus-visible:outline-offset-2",
      "forced-colors:focus-visible:outline-[Highlight]",
    ]) {
      expect(button.className).toContain(className);
    }
  });

  it("uses the base slot by default and lets a composed wrapper own its specialized slot", () => {
    const { rerender } = render(<Button>다시 시도</Button>);

    expect(screen.getByRole("button", { name: "다시 시도" }).getAttribute("data-slot"))
      .toBe("button");

    rerender(<Button data-slot="sidebar-trigger">사이드바 접기</Button>);

    expect(screen.getByRole("button", { name: "사이드바 접기" }).getAttribute("data-slot"))
      .toBe("sidebar-trigger");
  });

  it("keeps page action typography independent from its foreground color", () => {
    render(<Button size="page-action">클러스터 연결</Button>);

    const button = screen.getByRole("button", { name: "클러스터 연결" });
    expect(button.className).toContain("text-primary-foreground");
    expect(button.className).toContain("[font-size:var(--type-label-2)]");
    expect(button.className).toContain("h-[2.40234375rem]");
  });
});
