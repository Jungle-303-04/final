import { describe, expect, it } from "vitest";

import { rightsizingObservedWorkloadSchema } from "./rightsizing-schemas";

const observed = {
  availability: "partial",
  resource: {
    api_group: "apps",
    version: "v1",
    kind: "Deployment",
    namespace: "shop",
    name: "checkout",
    uid: "deployment-uid",
  },
  observed_at: "2026-07-16T09:00:00Z",
  freshness: "live",
  provenance: {
    collector: "metrics-repository",
    algorithm_revision: "2026-07",
    source_revision: "metrics-cut-17",
    window_started_at: "2026-07-09T09:00:00Z",
    window_ended_at: "2026-07-16T09:00:00Z",
    sample_interval_seconds: 300,
  },
  replicas: 2,
  scaled_to_zero: false,
  classification: "review",
  impact: {
    replicas: 2,
    cpu_millicores_change: 0,
    memory_bytes_change: 0,
  },
  rows: [{
    container: "server",
    resource: "cpu",
    fit: "oversized",
    action: "review",
    confidence: "medium",
    current_request: { unit: "millicores", value: 500 },
    observed_demand: { unit: "millicores", value: 180 },
    recommended_request: null,
    sample_count: 1_900,
    expected_samples: 2_016,
    coverage_basis_points: 9_424,
    signals: ["bursty"],
    reason_codes: ["bursty_cpu_review"],
  }],
  reason_codes: ["partial_container_evidence"],
} as const;

describe("rightsizing schemas", () => {
  it("accepts bounded server-owned recommendations", () => {
    expect(rightsizingObservedWorkloadSchema.parse(observed).classification).toBe("review");
  });

  it("rejects contradictory replica impact and resource units", () => {
    expect(() => rightsizingObservedWorkloadSchema.parse({
      ...observed,
      impact: { ...observed.impact, replicas: 3 },
    })).toThrow();
    expect(() => rightsizingObservedWorkloadSchema.parse({
      ...observed,
      rows: [{
        ...observed.rows[0],
        current_request: { unit: "bytes", value: 500 },
      }],
    })).toThrow();
  });
});
