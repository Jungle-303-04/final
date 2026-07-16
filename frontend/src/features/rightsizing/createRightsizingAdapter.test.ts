import { describe, expect, it, vi } from "vitest";

import { createRightsizingAdapter } from "./createRightsizingAdapter";

describe("createRightsizingAdapter", () => {
  it("maps a bounded server scan without deriving recommendations in the browser", async () => {
    const getRightsizingScan = vi.fn().mockResolvedValue({
      scope: {
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: ["shop"],
        freshness: "live",
      },
      namespace_scope: ["shop"],
      result: {
        availability: "available",
        observed_at: "2026-07-16T09:00:00Z",
        provenance: {
          collector: "metrics-repository",
          algorithm_revision: "revision-a",
          source_revision: "source-a",
          window_started_at: "2026-07-09T09:00:00Z",
          window_ended_at: "2026-07-16T09:00:00Z",
          sample_interval_seconds: 60,
        },
        coverage: {
          workloads_discovered: 1,
          workloads_evaluated: 1,
          workloads_with_data: 1,
          truncated: false,
        },
        workloads: [observedWorkload()],
        failures: [],
        reason_codes: [],
      },
      refresh_after_seconds: 60,
    });
    const port = createRightsizingAdapter({ getRightsizingScan });

    const scan = await port.getScan({
      clusterId: "cluster-a",
      namespaces: ["shop"],
      limit: 100,
    });

    expect(getRightsizingScan).toHaveBeenCalledWith({
      clusterId: "cluster-a",
      namespaces: ["shop"],
      limit: 100,
    }, undefined);
    expect(scan).toMatchObject({
      scope: { workspaceId: "workspace-a", clusterId: "cluster-a" },
      result: {
        availability: "available",
        coverage: { workloadsWithData: 1 },
        workloads: [{
          classification: "increase",
          rows: [{ action: "increase", recommendedRequest: { unit: "millicores", value: 500 } }],
        }],
      },
    });
  });
});

function observedWorkload() {
  return {
    availability: "available" as const,
    resource: {
      api_group: "apps",
      version: "v1",
      kind: "Deployment",
      namespace: "shop",
      name: "api",
      uid: "uid-api",
    },
    observed_at: "2026-07-16T09:00:00Z",
    freshness: "live" as const,
    provenance: {
      collector: "metrics-repository",
      algorithm_revision: "revision-a",
      source_revision: "source-a",
      window_started_at: "2026-07-09T09:00:00Z",
      window_ended_at: "2026-07-16T09:00:00Z",
      sample_interval_seconds: 60,
    },
    replicas: 2,
    scaled_to_zero: false,
    classification: "increase" as const,
    impact: {
      replicas: 2,
      cpu_millicores_change: 400,
      memory_bytes_change: 0,
    },
    rows: [{
      container: "api",
      resource: "cpu" as const,
      fit: "under_requested" as const,
      action: "increase" as const,
      confidence: "high" as const,
      current_request: { unit: "millicores" as const, value: 300 },
      observed_demand: { unit: "millicores" as const, value: 430 },
      recommended_request: { unit: "millicores" as const, value: 500 },
      sample_count: 100,
      expected_samples: 100,
      coverage_basis_points: 10_000,
      signals: [],
      reason_codes: [],
    }],
    reason_codes: [],
  };
}
