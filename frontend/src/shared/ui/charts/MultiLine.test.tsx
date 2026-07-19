// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MultiLine, normalizeTooltipPointIndex } from "./MultiLine";

afterEach(cleanup);

describe("MultiLine", () => {
  it("exposes server bucket values through keyboard crosshair navigation", () => {
    const { container } = render(
      <MultiLine
        ariaLabel="활동 추이"
        formatPoint={(index) => `bucket-${index}`}
        labels={["a", "b"]}
        series={[
          { id: "deploy", label: "배포", tone: "primary", values: [0, 2] },
          { id: "critical", label: "임계", tone: "critical", values: [1, 0] },
        ]}
      />,
    );

    const chart = screen.getByRole("img", { name: "활동 추이" });
    fireEvent.focus(chart);
    expect(screen.getByText("bucket-1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();

    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByText("bucket-0")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(chart.hasAttribute("aria-describedby")).toBe(true);
    expect(container.querySelector("[data-slot='chart'] > style")?.textContent)
      .toContain("--color-series0: var(--color-primary)");
  });

  it("keeps empty labels and series keyboard-safe", () => {
    const formatPoint = vi.fn((index: number) => `bucket-${index}`);
    const { rerender } = render(
      <MultiLine
        ariaLabel="빈 활동 추이"
        formatPoint={formatPoint}
        labels={[]}
        series={[{ id: "deploy", label: "배포", tone: "primary", values: [] }]}
      />,
    );

    const emptyChart = screen.getByRole("img", { name: "빈 활동 추이" });
    fireEvent.focus(emptyChart);
    fireEvent.keyDown(emptyChart, { key: "ArrowLeft" });
    expect(formatPoint).not.toHaveBeenCalled();
    expect(emptyChart.hasAttribute("aria-describedby")).toBe(false);

    rerender(
      <MultiLine
        ariaLabel="계열 없는 활동 추이"
        formatPoint={formatPoint}
        labels={["a"]}
        series={[]}
      />,
    );
    fireEvent.focus(screen.getByRole("img", { name: "계열 없는 활동 추이" }));
    expect(screen.getByText("bucket-0")).toBeTruthy();
  });

  it("normalizes the string tooltip indices emitted by Recharts", () => {
    expect(normalizeTooltipPointIndex("1", 2)).toBe(1);
    expect(normalizeTooltipPointIndex(0, 2)).toBe(0);
    expect(normalizeTooltipPointIndex("children[0]", 2)).toBeNull();
    expect(normalizeTooltipPointIndex("2", 2)).toBeNull();
    expect(normalizeTooltipPointIndex(undefined, 2)).toBeNull();
  });
});
