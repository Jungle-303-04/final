import type {
  ResourceDataQualitySection,
  ResourceDataQualityWarning,
  ResourceSummary,
} from "./resourcesContract";
import type { ResourcesEndpointResource } from "./resourcesEndpointContract";
import {
  toResourceSummary,
  type ResourceExpectations,
} from "./resourceProjection";
import {
  assertSameIdentity,
  assertSameOptionalIdentity,
  assertSameResourceType,
  responseOptionalIdentity,
  responseResourceType,
  ResourcesCanonicalError,
} from "./resourcesValidation";

export interface ProjectedResource {
  item: ResourceSummary;
  warnings: ResourceDataQualityWarning[];
}

export interface ProjectedCollection {
  items: ResourceSummary[];
  excludedCount: number;
  warnings: ResourceDataQualityWarning[];
}

export function isolateCollection(
  rows: ResourcesEndpointResource[],
  clusterId: string,
  section: "related" | "events",
  group: string | null,
  expectedResourceType?: string,
): ProjectedCollection {
  const items: ResourceSummary[] = [];
  const warnings: ResourceDataQualityWarning[] = [];
  const seenIds = new Set<string>();
  const seenInventoryKeys = new Set<string>();
  let excludedCount = 0;
  rows.forEach((row, rowIndex) => {
    assertResourceBoundary(row, clusterId, expectedResourceType);
    const projected = isolateProjection(
      row,
      clusterId,
      { expectedResourceType },
      section,
      rowIndex,
      group,
    );
    if (projected === null) {
      excludedCount += 1;
      warnings.push(excludedWarning("invalid-resource-excluded", section, rowIndex, group));
      return;
    }
    if (seenIds.has(projected.item.id) || seenInventoryKeys.has(projected.item.inventoryKey)) {
      excludedCount += 1;
      warnings.push(excludedWarning("duplicate-resource-excluded", section, rowIndex, group));
      return;
    }
    seenIds.add(projected.item.id);
    seenInventoryKeys.add(projected.item.inventoryKey);
    items.push(projected.item);
    warnings.push(...projected.warnings);
  });
  return { items, excludedCount, warnings };
}

export function isolateProjection(
  row: ResourcesEndpointResource,
  clusterId: string,
  expectations: ResourceExpectations,
  section: ResourceDataQualitySection,
  rowIndex: number,
  group: string | null,
): ProjectedResource | null {
  try {
    return projectResource(row, clusterId, expectations, section, rowIndex, group);
  } catch (error) {
    if (error instanceof ResourcesCanonicalError) return null;
    throw error;
  }
}

export function projectResource(
  row: ResourcesEndpointResource,
  clusterId: string,
  expectations: ResourceExpectations,
  section: ResourceDataQualitySection,
  rowIndex: number | null,
  group: string | null,
): ProjectedResource {
  const warnings: ResourceDataQualityWarning[] = [];
  const item = toResourceSummary(row, clusterId, expectations, (field) => {
    warnings.push({
      code: "optional-fact-unavailable",
      section,
      field,
      rowIndex,
      group,
    });
  });
  return { item, warnings };
}

export function assertResourceBoundary(
  row: ResourcesEndpointResource,
  clusterId: string,
  expectedResourceType?: string,
  expectedNamespace?: string | null,
  enforceNamespace = false,
): void {
  assertSameIdentity(row.cluster_id, clusterId);
  const resourceType = responseResourceType(row.resource_type);
  if (expectedResourceType !== undefined) {
    assertSameResourceType(resourceType, expectedResourceType);
  }
  const namespace = responseOptionalIdentity(row.namespace);
  if (enforceNamespace) assertSameOptionalIdentity(namespace, expectedNamespace ?? null);
}

export function excludedWarning(
  code: "invalid-resource-excluded" | "duplicate-resource-excluded",
  section: "list" | "related" | "events",
  rowIndex: number,
  group: string | null = null,
): ResourceDataQualityWarning {
  return { code, section, field: null, rowIndex, group };
}
