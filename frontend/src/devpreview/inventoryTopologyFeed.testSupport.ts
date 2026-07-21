import { toClusterTopologyView } from "./inventoryTopologyFeed";

type PhysicalTopologyFixture = Parameters<typeof toClusterTopologyView>[0];

/** Canonical endpoint-shaped fixture kept on the consumer side of the API boundary. */
export const PHYSICAL_TOPOLOGY_ENDPOINT = {
  view: "physical",
  cluster: {
    cluster_id: "cluster-a",
    name: "Production",
    provider: "eks",
  },
  cluster_projection_revision: 41,
  servers: [{
    id: "node:worker-a",
    name: "worker-a",
    cpu_pct: 68,
    mem_pct: null,
    status: "Ready",
    matched_pod_count: 1,
    total_pod_count: 14,
    matched_pod_count_completeness: "exact",
    total_pod_count_completeness: "partial",
  }],
  pods: [{
    id: "pod:shop/checkout-0",
    name: "checkout-0",
    namespace: "shop",
    server_id: "node:worker-a",
    usage_pct: null,
    cpu_mcores: 12.5,
    cpu_request_mcores: null,
    mem_mib: 48,
    mem_request_mib: null,
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
    filtered_count_completeness: "exact",
    unfiltered_count_completeness: "partial",
  },
  projection_completeness: "partial",
  metrics_completeness: "partial",
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
} satisfies PhysicalTopologyFixture;
