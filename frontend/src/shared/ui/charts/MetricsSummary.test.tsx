// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MetricsSummary } from "./MetricsSummary";
import type { TimeSeries } from "./types";

afterEach(cleanup);

describe("MetricsSummary", () => {
  it("uses caller-owned copy and ignores missing samples", () => {
    const series: TimeSeries[] = [
      {
        labels: { pod: "api-1" },
        dataPoints: [
          { timestamp: 1, value: 1 },
          { timestamp: 2 },
          { timestamp: 3, value: 3 },
        ],
      },
      {
        labels: { pod: "api-2" },
        dataPoints: [{ timestamp: 1, value: 2 }],
      },
    ];

    render(
      <MetricsSummary
        labels={{ current: "현재", average: "평균", peak: "최대" }}
        series={series}
        unit="cores"
      />,
    );

    expect(screen.getByText("현재")).toBeTruthy();
    expect(screen.getByText("평균")).toBeTruthy();
    expect(screen.getByText("최대")).toBeTruthy();
    expect(screen.queryByText("Current")).toBeNull();
    expect(screen.getByText("5.00")).toBeTruthy();
  });
});
