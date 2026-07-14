// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeriesLegend } from "./SeriesLegend";
import type { TimeSeries } from "./types";

afterEach(cleanup);

describe("SeriesLegend", () => {
  it("delegates overflow copy to the caller", () => {
    const formatOverflowCount = vi.fn((count: number) => `외 ${count}개`);
    const series: TimeSeries[] = Array.from({ length: 12 }, (_, index) => ({
      labels: { pod: `pod-${index}` },
      dataPoints: [],
    }));

    render(
      <SeriesLegend
        color="var(--primary)"
        formatOverflowCount={formatOverflowCount}
        series={series}
      />,
    );

    expect(screen.getByText("외 2개")).toBeTruthy();
    expect(formatOverflowCount).toHaveBeenCalledWith(2);
    expect(screen.queryByText(/more/u)).toBeNull();
  });
});
