import { vi } from "vitest";

import type {
  ResourcesFilterEndpointDependencies,
  ResourcesFilterEndpointFacetPage,
  ResourcesFilterEndpointLabelPage,
  ResourcesFilterEndpointResourceItem,
  ResourcesFilterEndpointResourcePage,
  ResourcesFilterEndpointSnapshot,
} from "./resourcesFilterEndpointContract";
import { createEmptyUnifiedFilterState, type UnifiedFilterState } from "../filters/filterContract";

export const FILTER_SNAPSHOT: ResourcesFilterEndpointSnapshot = {
  snapshot_revision: 42,
  authorization_revision: "auth-7",
  filter_fingerprint: "filter-7",
  observed_at: "2026-07-13T20:20:00Z",
  stale: true,
  partial_reason_codes: ["restricted-source"],
};

export const FACET_PAGE = {
  axis: "clusters",
  items: [
    {
      axis: "cluster",
      value: "cluster-a",
      cluster_id: "cluster-a",
      name: "Production",
      provider: "private-cloud/future",
      availability: "available",
    },
    {
      axis: "cluster",
      value: "cluster-restricted",
      cluster_id: "cluster-restricted",
      name: null,
      provider: null,
      availability: "restricted",
    },
  ],
  selected_resolutions: [
    {
      axis: "cluster",
      value: "cluster-restricted",
      status: "restricted",
      display_label: null,
    },
    {
      axis: "cluster",
      value: "cluster-missing",
      status: "unresolved",
      display_label: null,
    },
  ],
  next_cursor: "facet-cursor-2",
  has_more: true,
  snapshot: FILTER_SNAPSHOT,
} satisfies ResourcesFilterEndpointFacetPage;

export function endpointFilteredResource(
  overrides: Partial<ResourcesFilterEndpointResourceItem> = {},
): ResourcesFilterEndpointResourceItem {
  return {
    resource: {
      inventory_key: "inventory-pod-1",
      snapshot_id: "snapshot-42",
      workspace_id: "workspace-1",
      cluster_id: "cluster-a",
      resource_type: "pod",
      api_version: "v1",
      kind: "Pod",
      namespace: "shop",
      name: "checkout-api-0",
      uid: "uid-pod-1",
      resource_version: "10",
      status: "Running",
      health: "healthy",
      labels: { team: "checkout" },
      annotations: {},
      summary: {
        phase: "Running",
        containers: [{ name: "app", ready: true }],
      },
      observed_at: "2026-07-13T20:20:00Z",
      first_seen_at: "2026-07-13T19:20:00Z",
      last_seen_at: "2026-07-13T20:20:00Z",
      deleted_at: null,
      created_at: "2026-07-13T19:20:00Z",
      updated_at: "2026-07-13T20:20:00Z",
    },
    cluster: {
      cluster_id: "cluster-a",
      name: "Production",
      provider: "private-cloud/future",
    },
    application_ids: ["app-checkout", "app-platform"],
    application_binding_completeness: "partial",
    ...overrides,
  };
}

export const RESOURCE_PAGE = {
  items: [endpointFilteredResource()],
  next_cursor: "resource-cursor-2",
  has_more: true,
  counts: {
    filtered_count: 18,
    unfiltered_count: 120,
    filtered_count_completeness: "partial",
    unfiltered_count_completeness: "exact",
  },
  snapshot: FILTER_SNAPSHOT,
} satisfies ResourcesFilterEndpointResourcePage;

export const LABEL_PAGE = {
  surface: "resources",
  items: [{
    key: "team",
    value: "checkout",
    selector: "team=checkout",
    match_count: 18,
    count_completeness: "partial",
  }],
  selected_resolutions: [
    {
      key: "tier",
      value: "critical",
      selector: "tier=critical",
      status: "restricted",
    },
    {
      key: "environment",
      value: "missing",
      selector: "environment=missing",
      status: "zero",
    },
  ],
  next_cursor: null,
  has_more: false,
  counts: {
    filtered_count: null,
    unfiltered_count: 120,
    filtered_count_completeness: "unavailable",
    unfiltered_count_completeness: "exact",
  },
  snapshot: FILTER_SNAPSHOT,
} satisfies ResourcesFilterEndpointLabelPage;

export function filterEndpoints(
  overrides: Partial<ResourcesFilterEndpointDependencies> = {},
) {
  const facetImplementation: ResourcesFilterEndpointDependencies["listResourceFilterFacets"] =
    overrides.listResourceFilterFacets ?? (() => Promise.resolve(FACET_PAGE));
  const resourceImplementation: ResourcesFilterEndpointDependencies["listFilteredResources"] =
    overrides.listFilteredResources ?? (() => Promise.resolve(RESOURCE_PAGE));
  const labelImplementation: ResourcesFilterEndpointDependencies["listResourceLabelFacets"] =
    overrides.listResourceLabelFacets ?? (() => Promise.resolve(LABEL_PAGE));
  return {
    listResourceFilterFacets: vi.fn(facetImplementation),
    listFilteredResources: vi.fn(resourceImplementation),
    listResourceLabelFacets: vi.fn(labelImplementation),
  } satisfies ResourcesFilterEndpointDependencies;
}

export function populatedFilterState(): UnifiedFilterState {
  return {
    ...createEmptyUnifiedFilterState(),
    common: {
      clusters: ["cluster-b", "cluster-a", "cluster-b"],
      namespaces: [
        { clusterId: "cluster/b", namespace: "platform" },
        { clusterId: "cluster-a", namespace: "shop" },
      ],
      applications: ["app-platform", "app-checkout", "app-checkout"],
      labels: [
        { key: "tier", value: "critical" },
        { key: "team", value: "checkout" },
        { key: "tier", value: "canary" },
      ],
    },
    resources: {
      types: ["workload", "pod", "workload"],
      health: ["healthy", "degraded", "healthy"],
      includeDeleted: true,
      query: "  checkout api  ",
      view: "table",
    },
  };
}
