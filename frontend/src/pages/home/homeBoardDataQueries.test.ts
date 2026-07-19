import { describe, expect, it } from "vitest";

import type { CostOverview } from "../../features/cost/costContract";
import { projectHomeCost } from "./homeBoardDataQueries";

describe("projectHomeCost", () => {
  it("projects the observed hourly rate across the requested 30-day period", () => {
    const hourMs = 3_600_000;
    const overview: CostOverview = {
      scopeCoverage: {
        availability: "available",
        scopes: [],
        observedAt: "2026-07-19T00:00:00Z",
        reasonCodes: [],
      },
      observation: {
        availability: "available",
        observedAt: "2026-07-19T00:00:00Z",
        currency: "USD",
        dataWindow: "7d",
        reasonCodes: [],
      },
      summary: {
        availability: "available",
        hourlyCost: 1,
        monthlyProjection: 720,
        storageCost: null,
        idleCost: null,
        efficiency: null,
        savingsRecommendations: null,
        reasonCodes: [],
      },
      trend: {
        availability: "available",
        timeRange: "7d",
        currency: "USD",
        series: [{
          key: "cluster-1",
          label: "prod",
          points: [
            { timestamp: 0, rateMicros: 1_000_000 },
            { timestamp: 7 * 24 * 3_600, rateMicros: 1_000_000 },
          ],
        }],
        reasonCodes: [],
      },
    };

    const projection = projectHomeCost(overview, 0, 30 * 24 * hourMs);

    expect(projection.periodTotalMicros).toBe(720_000_000);
    expect(projection.periodTotalMicros).not.toBe(168_000_000);
  });
});
