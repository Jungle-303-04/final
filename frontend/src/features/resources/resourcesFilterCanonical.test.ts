import { describe, expect, it } from "vitest";

import {
  toResourcesFacetPage,
  toResourcesLabelFacetPage,
  toResourcesResourcePage,
} from "./resourcesFilterCanonical";
import type { ResourcesFilterEndpointResourceItem } from "./resourcesFilterEndpointContract";
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

  it("maps server-owned table metrics onto the existing resource row", () => {
    const row = {
      ...endpointFilteredResource(),
      metrics: {
        kind: "pod" as const,
        resource_uid: "uid-pod-1",
        source_snapshot_id: "snapshot-42",
        observed_at: "2026-07-17T01:00:00Z",
        measurement_window: "30s",
        cpu_mcores: 250,
        memory_mib: 192,
        cpu_request_mcores: 150,
        cpu_limit_mcores: 600,
        memory_request_mib: 192,
        memory_limit_mib: 384,
        completeness: "exact" as const,
        reason_codes: [],
      },
    } as ResourcesFilterEndpointResourceItem & { metrics: Record<string, unknown> };

    const result = toResourcesResourcePage({ ...RESOURCE_PAGE, items: [row] });

    expect(result.items[0]?.resource.tableMetrics).toEqual({
      kind: "pod",
      resourceUid: "uid-pod-1",
      sourceSnapshotId: "snapshot-42",
      observedAt: "2026-07-17T01:00:00.000Z",
      measurementWindow: "30s",
      cpuMillicores: 250,
      memoryMebibytes: 192,
      cpuRequestMillicores: 150,
      cpuLimitMillicores: 600,
      memoryRequestMebibytes: 192,
      memoryLimitMebibytes: 384,
      completeness: "exact",
      reasonCodes: [],
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
