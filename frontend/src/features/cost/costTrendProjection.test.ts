import { describe, expect, it } from "vitest";

import { projectCostTrend } from "./costTrendProjection";

describe("projectCostTrend", () => {
  it("sorts timestamps, preserves gaps, and projects integer micros without mutation", () => {
    const series = [{
      key: "namespace/shop",
      label: "shop",
      points: [
        { timestamp: 30, rateMicros: 3_000_000 },
        { timestamp: 10, rateMicros: 1_000_000 },
      ],
    }, {
      key: "namespace/platform",
      label: "platform",
      points: [
        { timestamp: 20, rateMicros: 2_000_000 },
        { timestamp: 30, rateMicros: 4_000_000 },
      ],
    }];

    expect(projectCostTrend(series)).toEqual({
      rows: [
        { timestamp: 10, series0: 1, series1: null },
        { timestamp: 20, series0: null, series1: 2 },
        { timestamp: 30, series0: 3, series1: 4 },
      ],
      series: [
        { dataKey: "series0", key: "namespace/shop", label: "shop" },
        { dataKey: "series1", key: "namespace/platform", label: "platform" },
      ],
    });
  });
});
