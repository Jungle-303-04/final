import { describe, expect, it } from "vitest";

import { groupRightsizingRows } from "./rightsizingModel";
import type { RightsizingMetric } from "./rightsizingContract";

const metric = (container: string, resource: "cpu" | "memory"): RightsizingMetric => ({
  container,
  resource,
  fit: "balanced",
  action: "in_range",
  confidence: "high",
  currentRequest: null,
  observedDemand: null,
  recommendedRequest: null,
  sampleCount: 10,
  expectedSamples: 10,
  coverageBasisPoints: 10_000,
  signals: [],
  reasonCodes: [],
});

describe("rightsizing view model", () => {
  it("groups server-classified rows without calculating impact or action", () => {
    const groups = groupRightsizingRows([
      metric("api", "cpu"),
      metric("sidecar", "cpu"),
      metric("api", "memory"),
    ]);

    expect(groups.map((group) => group.container)).toEqual(["api", "sidecar"]);
    expect(groups[0]?.rows.map((row) => row.resource)).toEqual(["cpu", "memory"]);
    expect(groups[0]?.rows[0]?.action).toBe("in_range");
  });
});
