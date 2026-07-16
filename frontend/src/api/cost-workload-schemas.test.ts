import { describe, expect, it } from "vitest";

import { costWorkloadAllocationSchema } from "./cost-workload-schemas";

const observed = {
  availability: "partial",
  observed_at: "2026-07-16T09:00:00Z",
  currency: "USD",
  current: {
    replicas: 2,
    hourly_rate_micros: 300_000,
    projected_daily_micros: 7_200_000,
    projected_monthly_micros: 219_000_000,
    cpu_rate_micros: 180_000,
    memory_rate_micros: 120_000,
    cpu_allocation_use_basis_points: 2_500,
    memory_allocation_use_basis_points: 4_000,
    cpu_usage_window_seconds: 3_600,
    memory_usage_window_seconds: 60,
  },
  trend: {
    availability: "unavailable",
    range: "24h",
    currency: null,
    series: [],
    reason_codes: ["workload_history_not_observed"],
  },
  reason_codes: ["workload_history_not_observed"],
} as const;

describe("costWorkloadAllocationSchema", () => {
  it("accepts a bounded server-computed workload allocation", () => {
    const result = costWorkloadAllocationSchema.parse(observed);
    expect(result.availability).toBe("partial");
    if (result.availability === "unavailable") throw new Error("expected observed cost");
    expect(result.current.projected_monthly_micros).toBe(219_000_000);
  });

  it("rejects browser-unsafe or contradictory allocation evidence", () => {
    expect(() => costWorkloadAllocationSchema.parse({
      ...observed,
      current: { ...observed.current, hourly_rate_micros: 1 },
    })).toThrow();
    expect(() => costWorkloadAllocationSchema.parse({
      ...observed,
      reason_codes: ["duplicate", "duplicate"],
    })).toThrow();
  });
});
