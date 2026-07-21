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
import type {
  ResourcesFilterEndpointFacetPage,
  ResourcesFilterEndpointLabelPage,
  ResourcesFilterEndpointResourcePage,
} from "./resourcesFilterEndpointContract";
import { responseTimestamp } from "./resourcesValidation";

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
    items.push({
      resource: projected.item,
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
