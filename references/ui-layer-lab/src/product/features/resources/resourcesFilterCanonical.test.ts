import { describe, expect, it } from "vitest";

import {
  toResourcesFacetPage,
  toResourcesLabelFacetPage,
  toResourcesResourcePage,
} from "./resourcesFilterCanonical";
import {
  FACET_PAGE,
  FILTER_SNAPSHOT,
  LABEL_PAGE,
  RESOURCE_PAGE,
  endpointFilteredResource,
} from "./createResourcesFilterAdapter.testSupport";

describe("Resources filter canonical projections", () => {
  it("preserves restricted and unresolved structural selections and snapshot state", () => {
    expect(toResourcesFacetPage(FACET_PAGE)).toEqual({
      axis: "clusters",
      items: [
        {
          axis: "cluster",
          value: "cluster-a",
          clusterId: "cluster-a",
          name: "Production",
          provider: "private-cloud/future",
          availability: "available",
        },
        {
          axis: "cluster",
          value: "cluster-restricted",
          clusterId: "cluster-restricted",
          name: null,
          provider: null,
          availability: "restricted",
        },
      ],
      selectedResolutions: [
        {
          axis: "cluster",
          value: "cluster-restricted",
          status: "restricted",
          displayLabel: null,
        },
        {
          axis: "cluster",
          value: "cluster-missing",
          status: "unresolved",
          displayLabel: null,
        },
      ],
      nextCursor: "facet-cursor-2",
      hasMore: true,
      snapshot: {
        snapshotRevision: 42,
        authorizationRevision: "auth-7",
        filterFingerprint: "filter-7",
        observedAt: "2026-07-13T20:20:00.000Z",
        stale: true,
        partialReasonCodes: ["restricted-source"],
      },
    });
  });

  it("maps resource, cluster metadata, and application bindings without provider branching", () => {
    const result = toResourcesResourcePage(RESOURCE_PAGE);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      resource: expect.objectContaining({
        id: "resource:cluster-a/uid-pod-1",
        clusterId: "cluster-a",
        resourceType: "pod",
        kind: "Pod",
        namespace: "shop",
        name: "checkout-api-0",
        health: "healthy",
      }),
      cluster: {
        clusterId: "cluster-a",
        name: "Production",
        provider: "private-cloud/future",
      },
      applicationIds: ["app-checkout", "app-platform"],
      applicationBindingCompleteness: "partial",
    });
    expect(result).toMatchObject({
      counts: {
        filteredCount: 18,
        unfilteredCount: 120,
        filteredCountCompleteness: "partial",
        unfilteredCountCompleteness: "exact",
      },
      nextCursor: "resource-cursor-2",
      hasMore: true,
      excludedCount: 0,
      dataQualityWarnings: [],
      snapshot: {
        stale: true,
        partialReasonCodes: ["restricted-source"],
      },
    });
  });

  it("isolates malformed and duplicate product rows without changing server counts", () => {
    const invalid = endpointFilteredResource({
      resource: {
        ...endpointFilteredResource().resource,
        inventory_key: "inventory-invalid",
        uid: "uid-invalid",
        name: " ",
      },
    });
    const duplicate = endpointFilteredResource({
      resource: {
        ...endpointFilteredResource().resource,
        inventory_key: "inventory-duplicate",
      },
      cluster: {
        cluster_id: "cluster-a",
        name: "Same resource through another row",
        provider: "another-provider-value",
      },
    });

    const result = toResourcesResourcePage({
      ...RESOURCE_PAGE,
      items: [endpointFilteredResource(), invalid, duplicate],
    });

    expect(result.items.map(
      (item: { resource: { name: string } }) => item.resource.name,
    )).toEqual(["checkout-api-0"]);
    expect(result.counts).toEqual({
      filteredCount: 18,
      unfilteredCount: 120,
      filteredCountCompleteness: "partial",
      unfilteredCountCompleteness: "exact",
    });
    expect(result).toMatchObject({
      excludedCount: 2,
      dataQualityWarnings: [
        {
          code: "invalid-resource-excluded",
          section: "list",
          field: null,
          rowIndex: 1,
          group: null,
        },
        {
          code: "duplicate-resource-excluded",
          section: "list",
          field: null,
          rowIndex: 2,
          group: null,
        },
      ],
    });
  });

  it("preserves server Label counts, selected status, and unavailable totals", () => {
    expect(toResourcesLabelFacetPage(LABEL_PAGE)).toEqual({
      surface: "resources",
      items: [{
        key: "team",
        value: "checkout",
        selector: "team=checkout",
        matchCount: 18,
        countCompleteness: "partial",
      }],
      selectedResolutions: [
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
      nextCursor: null,
      hasMore: false,
      counts: {
        filteredCount: null,
        unfilteredCount: 120,
        filteredCountCompleteness: "unavailable",
        unfilteredCountCompleteness: "exact",
      },
      snapshot: {
        snapshotRevision: FILTER_SNAPSHOT.snapshot_revision,
        authorizationRevision: FILTER_SNAPSHOT.authorization_revision,
        filterFingerprint: FILTER_SNAPSHOT.filter_fingerprint,
        observedAt: "2026-07-13T20:20:00.000Z",
        stale: true,
        partialReasonCodes: ["restricted-source"],
      },
    });
  });
});
