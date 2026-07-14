import { describe, expect, it, vi } from "vitest";

import { createEmptyUnifiedFilterState } from "../filters/filterContract";
import { createPhysicalTopologyAdapter } from "./createPhysicalTopologyAdapter";

const PHYSICAL_TOPOLOGY_ENDPOINT = {
  view: "physical" as const,
  cluster: { cluster_id: "cluster-a", name: "Production", provider: "eks" },
  cluster_projection_revision: 41,
  servers: [{
    id: "node:worker-a",
    name: "worker-a",
    cpu_pct: 68,
    mem_pct: null,
    status: "Ready",
    matched_pod_count: 1,
    total_pod_count: 14,
    matched_pod_count_completeness: "exact" as const,
    total_pod_count_completeness: "partial" as const,
  }],
  pods: [{
    id: "pod:shop/checkout-0",
    name: "checkout-0",
    namespace: "shop",
    server_id: "node:worker-a",
    usage_pct: null,
    cpu_mcores: 12.5,
    cpu_request_mcores: 100,
    mem_mib: 48,
    mem_request_mib: 64,
    phase: "CrashLoopBackOff",
    health: "critical",
    restarts: 7,
    matches_filter: true,
  }],
  truncated: { "node:worker-a": 13 },
  unassigned_truncated_count: 0,
  counts: {
    filtered_count: 1,
    unfiltered_count: 14,
    filtered_count_completeness: "exact" as const,
    unfiltered_count_completeness: "partial" as const,
  },
  projection_completeness: "partial" as const,
  metrics_completeness: "partial" as const,
  metrics_observed_at: "2026-07-14T05:20:00Z",
  partial_reason_codes: ["source_resources_truncated"],
  snapshot: {
    snapshot_revision: 42,
    authorization_revision: "auth-1",
    filter_fingerprint: "filter-1",
    observed_at: "2026-07-14T05:20:00Z",
    stale: false,
    partial_reason_codes: ["source_resources_truncated"],
  },
};

describe("physical topology adapter", () => {
  it("forwards one canonical filter request and preserves server matches_filter", async () => {
    const state = createEmptyUnifiedFilterState();
    state.common.clusters = ["cluster-a"];
    state.common.namespaces = [{ clusterId: "cluster-a", namespace: "shop" }];
    state.common.applications = ["checkout"];
    state.common.labels = [{ key: "team", value: "checkout" }];
    state.resources.types = ["pod"];
    state.resources.health = ["critical"];
    state.resources.query = " checkout ";
    const getPhysicalTopology = vi.fn().mockResolvedValue(PHYSICAL_TOPOLOGY_ENDPOINT);
    const controller = new AbortController();

    const result = await createPhysicalTopologyAdapter({ getPhysicalTopology })
      .loadPhysicalTopology(state, { snapshotRevision: 42 }, controller.signal);

    expect(getPhysicalTopology).toHaveBeenCalledWith({
      clusters: ["cluster-a"],
      namespaces: ["cluster-a/shop"],
      applications: ["checkout"],
      resourceTypes: ["pod"],
      health: ["critical"],
      labels: ["team=checkout"],
      query: "checkout",
      includeDeleted: false,
      snapshotRevision: 42,
    }, controller.signal);
    expect(result).toMatchObject({
      clusterId: "cluster-a",
      clusterProjectionRevision: 41,
      servers: [{
        matchedPodCount: 1,
        totalPodCount: 14,
        totalPodCountCompleteness: "partial",
      }],
      pods: [{
        matchesFilter: true,
        usagePercent: null,
        cpuRequestMillicores: 100,
        memoryRequestMebibytes: 64,
      }],
      truncatedByServer: { "node:worker-a": 13 },
      metricsObservedAt: "2026-07-14T05:20:00Z",
    });
  });
});
