import {
  excludedWarning,
  isolateProjection,
} from "./resourceCollectionIsolation";
import type {
  ResourcesFilterFacetPage,
  ResourcesFilterLabelFacetPage,
  ResourcesFilterResourcePage,
  ResourcesFilterSnapshot,
} from "./resourcesFilterContract";
import type { ResourceSummary, ResourceTableMetrics } from "./resourcesContract";
import type {
  ResourcesFilterEndpointFacetPage,
  ResourcesFilterEndpointLabelPage,
  ResourcesFilterEndpointResourcePage,
} from "./resourcesFilterEndpointContract";
import { invalidResponse, responseTimestamp } from "./resourcesValidation";

export function toResourcesFacetPage(
  wire: ResourcesFilterEndpointFacetPage,
): ResourcesFilterFacetPage {
  return {
    axis: wire.axis,
    items: wire.items.map((item) => {
      if (item.axis === "cluster") {
        return {
          axis: item.axis,
          value: item.value,
          clusterId: item.cluster_id,
          name: item.name,
          provider: item.provider,
          availability: item.availability,
        };
      }
      if (item.axis === "namespace") {
        return {
          axis: item.axis,
          value: item.value,
          clusterId: item.cluster_id,
          namespace: item.namespace,
          availability: item.availability,
        };
      }
      return {
        axis: item.axis,
        value: item.value,
        applicationId: item.application_id,
        name: item.name,
        environment: item.environment,
        availability: item.availability,
      };
    }),
    selectedResolutions: wire.selected_resolutions.map((resolution) => ({
      axis: resolution.axis,
      value: resolution.value,
      status: resolution.status,
      displayLabel: resolution.display_label,
    })),
    nextCursor: wire.next_cursor,
    hasMore: wire.has_more,
    snapshot: toSnapshot(wire.snapshot),
  };
}

export function toResourcesResourcePage(
  wire: ResourcesFilterEndpointResourcePage,
): ResourcesFilterResourcePage {
  const items: ResourcesFilterResourcePage["items"] = [];
  const dataQualityWarnings: ResourcesFilterResourcePage["dataQualityWarnings"] = [];
  const seenIds = new Set<string>();
  const seenInventoryKeys = new Set<string>();
  let excludedCount = 0;

  wire.items.forEach((row, rowIndex) => {
    const projected = isolateProjection(
      row.resource,
      row.cluster.cluster_id,
      {},
      "list",
      rowIndex,
      null,
    );
    if (projected === null) {
      excludedCount += 1;
      dataQualityWarnings.push(
        excludedWarning("invalid-resource-excluded", "list", rowIndex),
      );
      return;
    }
    if (
      seenIds.has(projected.item.id) ||
      seenInventoryKeys.has(projected.item.inventoryKey)
    ) {
      excludedCount += 1;
      dataQualityWarnings.push(
        excludedWarning("duplicate-resource-excluded", "list", rowIndex),
      );
      return;
    }
    seenIds.add(projected.item.id);
    seenInventoryKeys.add(projected.item.inventoryKey);
    dataQualityWarnings.push(...projected.warnings);
    const tableMetrics = toResourceTableMetrics(
      row.metrics,
      projected.item,
      row.resource.snapshot_id,
    );
    items.push({
      resource: tableMetrics === undefined
        ? projected.item
        : { ...projected.item, tableMetrics },
      cluster: {
        clusterId: row.cluster.cluster_id,
        name: row.cluster.name,
        provider: row.cluster.provider,
      },
      applicationIds: [...row.application_ids],
      applicationBindingCompleteness: row.application_binding_completeness,
    });
  });

  return {
    items,
    nextCursor: wire.next_cursor,
    hasMore: wire.has_more,
    counts: {
      filteredCount: wire.counts.filtered_count,
      unfilteredCount: wire.counts.unfiltered_count,
      filteredCountCompleteness: wire.counts.filtered_count_completeness,
      unfilteredCountCompleteness: wire.counts.unfiltered_count_completeness,
    },
    snapshot: toSnapshot(wire.snapshot),
    excludedCount,
    dataQualityWarnings,
  };
}

function toResourceTableMetrics(
  wire: ResourcesFilterEndpointResourcePage["items"][number]["metrics"],
  resource: ResourceSummary,
  sourceSnapshotId: string,
): ResourceTableMetrics | undefined {
  if (wire === null || wire === undefined) return undefined;
  if (
    wire.kind !== resource.resourceType ||
    wire.resource_uid !== resource.uid ||
    wire.source_snapshot_id !== sourceSnapshotId
  ) {
    invalidResponse();
  }
  const common = {
    resourceUid: wire.resource_uid,
    sourceSnapshotId: wire.source_snapshot_id,
    observedAt: responseTimestamp(wire.observed_at),
    measurementWindow: wire.measurement_window,
    cpuMillicores: wire.cpu_mcores,
    memoryMebibytes: wire.memory_mib,
    completeness: wire.completeness,
    reasonCodes: [...wire.reason_codes],
  };
  if (wire.kind === "pod") {
    return {
      ...common,
      kind: wire.kind,
      cpuRequestMillicores: wire.cpu_request_mcores,
      cpuLimitMillicores: wire.cpu_limit_mcores,
      memoryRequestMebibytes: wire.memory_request_mib,
      memoryLimitMebibytes: wire.memory_limit_mib,
    };
  }
  return {
    ...common,
    kind: wire.kind,
    cpuAllocatableMillicores: wire.cpu_allocatable_mcores,
    memoryAllocatableMebibytes: wire.memory_allocatable_mib,
    podCount: wire.pod_count,
    podAllocatable: wire.pod_allocatable,
  };
}

export function toResourcesLabelFacetPage(
  wire: ResourcesFilterEndpointLabelPage,
): ResourcesFilterLabelFacetPage {
  return {
    surface: wire.surface,
    items: wire.items.map((item) => ({
      key: item.key,
      value: item.value,
      selector: item.selector,
      matchCount: item.match_count,
      countCompleteness: item.count_completeness,
    })),
    selectedResolutions: wire.selected_resolutions.map((resolution) => ({
      key: resolution.key,
      value: resolution.value,
      selector: resolution.selector,
      status: resolution.status,
    })),
    nextCursor: wire.next_cursor,
    hasMore: wire.has_more,
    counts: {
      filteredCount: wire.counts.filtered_count,
      unfilteredCount: wire.counts.unfiltered_count,
      filteredCountCompleteness: wire.counts.filtered_count_completeness,
      unfilteredCountCompleteness: wire.counts.unfiltered_count_completeness,
    },
    snapshot: toSnapshot(wire.snapshot),
  };
}

function toSnapshot(
  wire: ResourcesFilterEndpointFacetPage["snapshot"],
): ResourcesFilterSnapshot {
  return {
    snapshotRevision: wire.snapshot_revision,
    authorizationRevision: wire.authorization_revision,
    filterFingerprint: wire.filter_fingerprint,
    observedAt: responseTimestamp(wire.observed_at),
    stale: wire.stale,
    partialReasonCodes: [...wire.partial_reason_codes],
  };
}
