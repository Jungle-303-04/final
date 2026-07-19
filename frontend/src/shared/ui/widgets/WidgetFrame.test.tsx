// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WidgetFrame } from "./WidgetFrame";

describe("WidgetFrame", () => {
  it("requires a real deep link and exposes collapse state", () => {
    render(
      <WidgetFrame
        collapseLabel="접기"
        collapsible
        deepLink={{ href: "/issues", label: "이슈 열기" }}
        expandLabel="펼치기"
        title="이슈"
      >
        <span>실데이터</span>
      </WidgetFrame>,
    );

    expect(screen.getByRole("link", { name: "이슈 열기" })
      .getAttribute("href")).toBe("/issues");
    const toggle = screen.getByRole("button", { name: "접기" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "펼치기" })
      .getAttribute("aria-expanded")).toBe("false");
  });

  it("reports controlled collapse changes for persisted board preferences", () => {
    const onCollapsedChange = vi.fn();
    render(
      <WidgetFrame
        collapseLabel="접기"
        collapsed={false}
        collapsible
        expandLabel="펼치기"
        onCollapsedChange={onCollapsedChange}
        title="활동"
      >
        실데이터
      </WidgetFrame>,
    );

    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });
});
