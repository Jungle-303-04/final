import { describe, expect, it } from "vitest";

import {
  filteredInventoryResourceListSchema,
  labelFacetPageSchema,
  resourceFilterFacetPageSchema,
} from "./resource-filter-schemas";

const SNAPSHOT = {
  snapshot_revision: 42,
  authorization_revision: "auth-revision-1",
  filter_fingerprint: "filter-fingerprint-1",
  observed_at: "2026-07-13T20:20:00Z",
  stale: false,
  partial_reason_codes: [],
};

const RESOURCE = {
  inventory_key: "cluster-a:apps/v1:Deployment:shop:checkout",
  snapshot_id: "snapshot-42",
  workspace_id: "workspace-a",
  cluster_id: "cluster-a",
  resource_type: "workload",
  api_version: "apps/v1",
  kind: "Deployment",
  namespace: "shop",
  name: "checkout",
  uid: "uid-checkout",
  resource_version: "42",
  status: "Ready",
  health: "healthy",
  labels: { team: "checkout" },
  annotations: {},
  summary: { ready_replicas: 3 },
  observed_at: "2026-07-13T20:20:00Z",
  first_seen_at: "2026-07-13T19:20:00Z",
  last_seen_at: "2026-07-13T20:20:00Z",
  deleted_at: null,
  created_at: "2026-07-13T19:20:00Z",
  updated_at: "2026-07-13T20:20:00Z",
};

const COUNTS = {
  filtered_count: 1,
  unfiltered_count: 92,
  filtered_count_completeness: "partial",
  unfiltered_count_completeness: "exact",
};

describe("Resources filter response schemas", () => {
  it("accepts honest partial and unavailable states", () => {
    expect(filteredInventoryResourceListSchema.parse({
      items: [{
        resource: RESOURCE,
        cluster: { cluster_id: "cluster-a", name: null, provider: "private-cloud" },
        application_ids: ["app-checkout"],
        application_binding_completeness: "partial",
      }],
      next_cursor: null,
      has_more: false,
      counts: COUNTS,
      snapshot: { ...SNAPSHOT, partial_reason_codes: ["labels-incomplete"] },
    }).counts.filtered_count_completeness).toBe("partial");

    expect(labelFacetPageSchema.parse({
      surface: "resources",
      items: [],
      selected_resolutions: [{
        key: "tier",
        value: "critical",
        selector: "tier=critical",
        status: "unavailable",
      }],
      next_cursor: null,
      has_more: false,
      counts: {
        filtered_count: null,
        unfiltered_count: null,
        filtered_count_completeness: "unavailable",
        unfiltered_count_completeness: "unavailable",
      },
      snapshot: { ...SNAPSHOT, snapshot_revision: 0, observed_at: null },
    }).selected_resolutions[0]?.status).toBe("unavailable");
  });

  it("rejects a mixed structural axis and mismatched facet identity", () => {
    const base = {
      axis: "namespaces",
      selected_resolutions: [],
      next_cursor: null,
      has_more: false,
      snapshot: SNAPSHOT,
    };

    expect(resourceFilterFacetPageSchema.safeParse({
      ...base,
      items: [{
        axis: "cluster",
        value: "cluster-a",
        cluster_id: "cluster-a",
        name: null,
        provider: null,
        availability: "available",
      }],
    }).success).toBe(false);
    expect(resourceFilterFacetPageSchema.safeParse({
      ...base,
      items: [{
        axis: "namespace",
        value: "cluster-a/wrong",
        cluster_id: "cluster-a",
        namespace: "shop",
        availability: "available",
      }],
    }).success).toBe(false);
  });

  it("rejects raw object leakage and cross-cluster row identity", () => {
    const base = {
      next_cursor: null,
      has_more: false,
      counts: COUNTS,
      snapshot: SNAPSHOT,
    };

    expect(filteredInventoryResourceListSchema.safeParse({
      ...base,
      items: [{
        resource: { ...RESOURCE, raw: { forbidden: true } },
        cluster: { cluster_id: "cluster-a", name: null, provider: null },
        application_ids: [],
        application_binding_completeness: "exact",
      }],
    }).success).toBe(false);
    expect(filteredInventoryResourceListSchema.safeParse({
      ...base,
      items: [{
        resource: RESOURCE,
        cluster: { cluster_id: "different-cluster", name: null, provider: null },
        application_ids: [],
        application_binding_completeness: "exact",
      }],
    }).success).toBe(false);
  });

  it("rejects contradictory selector, count, and pagination fields", () => {
    const labelPage = {
      surface: "resources",
      items: [{
        key: "team",
        value: "checkout",
        selector: "team=payments",
        match_count: 1,
        count_completeness: "exact",
      }],
      selected_resolutions: [],
      next_cursor: null,
      has_more: false,
      counts: COUNTS,
      snapshot: SNAPSHOT,
    };
    expect(labelFacetPageSchema.safeParse(labelPage).success).toBe(false);
    expect(labelFacetPageSchema.safeParse({
      ...labelPage,
      items: [],
      counts: {
        ...COUNTS,
        filtered_count: null,
        filtered_count_completeness: "exact",
      },
    }).success).toBe(false);
    expect(resourceFilterFacetPageSchema.safeParse({
      axis: "clusters",
      items: [],
      selected_resolutions: [],
      next_cursor: null,
      has_more: true,
      snapshot: SNAPSHOT,
    }).success).toBe(false);
  });
});
