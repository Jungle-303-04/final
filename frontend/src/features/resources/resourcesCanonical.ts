import type {
  ResourceCatalog,
  ResourceApiDiscovery,
  ResourceDataQualityWarning,
  ResourceDetail,
  ResourceHealthCounts,
  ResourceIdentity,
  ResourceList,
  ResourceRelatedGroup,
  ResourceSummary,
} from "./resourcesContract";
import type {
  KubernetesApiResourcesEndpoint,
  ResourcesEndpointInventorySummary,
  ResourcesEndpointResourceDetail,
  ResourcesEndpointResourceList,
} from "./resourcesEndpointContract";
import {
  assertResourceBoundary,
  excludedWarning,
  isolateCollection,
  isolateProjection,
  projectResource,
} from "./resourceCollectionIsolation";
import type { CanonicalResourceListRequest } from "./resourcesRequests";
import {
  assertSameIdentity,
  assertSameOptionalIdentity,
  assertSameResourceType,
  assertUnique,
  healthTone,
  invalidResponse,
  nonNegativeInteger,
  responseIdentity,
  responseOptionalIdentity,
  responseRecord,
  responseResourceType,
  responseTimestamp,
  safeAdd,
} from "./resourcesValidation";
import { toProviderResourceDetail } from "./providerResourceCanonical";
import { toResourceAccessDetail } from "./resourceAccessContract";

export function toResourceCatalog(
  requestedClusterId: string,
  wire: ResourcesEndpointInventorySummary,
  apiWire: KubernetesApiResourcesEndpoint,
): ResourceCatalog {
  assertSameIdentity(wire.cluster_id, requestedClusterId);
  assertSameIdentity(apiWire.cluster_id, requestedClusterId);
  const byResourceType = new Map<string, ResourceHealthCounts>();
  for (const rawCount of wire.counts) {
    const record = responseRecord(rawCount);
    const resourceType = responseResourceType(requiredString(record, "resource_type"));
    const tone = healthTone(requiredString(record, "health"));
    const counts = byResourceType.get(resourceType) ?? emptyHealthCounts();
    counts[tone] = safeAdd(counts[tone], nonNegativeInteger(record.count));
    byResourceType.set(resourceType, counts);
  }
  const items = [...byResourceType.entries()]
    .map(([resourceType, healthCounts]) => ({
      resourceType,
      count: Object.values(healthCounts).reduce(safeAdd, 0),
      healthCounts,
    }))
    .sort((left, right) => left.resourceType.localeCompare(right.resourceType));
  const evidence = resourceCountEvidence(wire.counts_evidence);
  return {
    clusterId: requestedClusterId,
    completeness: evidence.completeness,
    observedAt: evidence.observedAt,
    namespaceScope: evidence.namespaceScope,
    reasonCodes: evidence.reasonCodes,
    forbidden: evidence.forbidden,
    items,
    apiDiscovery: toApiResourceDiscovery(apiWire),
  };
}

function resourceCountEvidence(
  value: ResourcesEndpointInventorySummary["counts_evidence"],
): Pick<
  ResourceCatalog,
  "completeness" | "observedAt" | "namespaceScope" | "reasonCodes" | "forbidden"
> {
  const namespaceScope = value.namespace_scope.map(responseIdentity);
  const reasonCodes = value.reason_codes.map(responseIdentity);
  if (new Set(namespaceScope).size !== namespaceScope.length
    || [...namespaceScope].sort().some((item, index) => item !== namespaceScope[index])
    || new Set(reasonCodes).size !== reasonCodes.length) invalidResponse();
  const observedAt = responseTimestamp(value.observed_at);
  if (value.completeness === "observed" && (observedAt === null || reasonCodes.length > 0)) {
    invalidResponse();
  }
  if (value.completeness !== "observed" && reasonCodes.length === 0) invalidResponse();
  if (value.completeness === "unavailable" && (observedAt !== null || value.forbidden.length > 0)) {
    invalidResponse();
  }
  return {
    completeness: value.completeness,
    observedAt,
    namespaceScope,
    reasonCodes,
    forbidden: value.forbidden.map((item) => ({
      namespace: responseOptionalIdentity(item.namespace),
      apiGroup: item.api_group,
      version: responseIdentity(item.version),
      resource: responseIdentity(item.resource),
      kind: responseIdentity(item.kind),
      namespaced: item.namespaced,
      reasonCode: item.reason_code,
    })),
  };
}

function toApiResourceDiscovery(
  wire: KubernetesApiResourcesEndpoint,
): ResourceApiDiscovery {
  if (wire.discovery === null) {
    if (!wire.unavailable_reason) invalidResponse();
    return {
      completeness: "unavailable",
      observedAt: null,
      reasonCodes: [wire.unavailable_reason],
      resources: [],
    };
  }
  if (wire.unavailable_reason !== null) invalidResponse();
  return {
    completeness: wire.discovery.completeness,
    observedAt: responseTimestamp(wire.discovery.observed_at),
    reasonCodes: [...wire.discovery.reason_codes],
    resources: wire.discovery.resources.map((resource) => ({
      apiVersion: responseIdentity(resource.api_version),
      group: resource.group,
      version: responseIdentity(resource.version),
      pluralName: responseIdentity(resource.name),
      singularName: resource.singular_name,
      kind: responseIdentity(resource.kind),
      namespaced: resource.namespaced,
      isCrd: resource.is_crd,
      verbs: [...resource.verbs],
    })),
  };
}

export function toResourceList(
  request: CanonicalResourceListRequest,
  wire: ResourcesEndpointResourceList,
): ResourceList {
  assertSameIdentity(wire.cluster_id, request.clusterId);
  if (wire.resource_type === null) invalidResponse();
  assertSameResourceType(wire.resource_type, request.resourceType);
  if (wire.resources.length > request.limit) invalidResponse();
  const dataQualityWarnings: ResourceDataQualityWarning[] = [];
  const items: ResourceSummary[] = [];
  const seenIds = new Set<string>();
  const seenInventoryKeys = new Set<string>();
  let excludedCount = 0;
  wire.resources.forEach((resource, rowIndex) => {
    assertResourceBoundary(
      resource,
      request.clusterId,
      request.resourceType,
      request.namespace,
      request.namespace !== null,
    );
    const projected = isolateProjection(resource, request.clusterId, {
      expectedResourceType: request.resourceType,
      expectedNamespace: request.namespace,
      enforceNamespace: request.namespace !== null,
    }, "list", rowIndex, null);
    if (projected === null || (!request.includeDeleted && projected.item.deletedAt !== null)) {
      excludedCount += 1;
      dataQualityWarnings.push(excludedWarning("invalid-resource-excluded", "list", rowIndex));
      return;
    }
    if (seenIds.has(projected.item.id) || seenInventoryKeys.has(projected.item.inventoryKey)) {
      excludedCount += 1;
      dataQualityWarnings.push(excludedWarning("duplicate-resource-excluded", "list", rowIndex));
      return;
    }
    seenIds.add(projected.item.id);
    seenInventoryKeys.add(projected.item.inventoryKey);
    items.push(projected.item);
    dataQualityWarnings.push(...projected.warnings);
  });
  return {
    clusterId: request.clusterId,
    resourceType: request.resourceType,
    namespace: request.namespace,
    includeDeleted: request.includeDeleted,
    completeness: "unknown",
    limit: request.limit,
    returned: items.length,
    limitReached: wire.resources.length === request.limit,
    excludedCount,
    dataQualityWarnings,
    items,
  };
}

export function toResourceDetail(
  requestedClusterId: string,
  requestedIdentity: ResourceIdentity,
  wire: ResourcesEndpointResourceDetail,
): ResourceDetail {
  assertSameIdentity(wire.cluster_id, requestedClusterId);
  assertDetailIdentity(wire.identity, requestedIdentity);
  assertResourceBoundary(
    wire.resource,
    requestedClusterId,
    requestedIdentity.resourceType,
    requestedIdentity.namespace,
    true,
  );
  const primary = projectResource(wire.resource, requestedClusterId, {
    expectedResourceType: requestedIdentity.resourceType,
    expectedNamespace: requestedIdentity.namespace,
    enforceNamespace: true,
  }, "resource", null, null);
  const resource = primary.item;
  assertSameIdentity(resource.kind, requestedIdentity.kind);
  assertSameIdentity(resource.name, requestedIdentity.name);
  const dataQualityWarnings = [...primary.warnings];
  let relatedExcludedCount = 0;
  const related: ResourceRelatedGroup[] = Object.entries(wire.related).map(([rawName, rows]) => {
    const name = responseIdentity(rawName);
    const projected = isolateCollection(rows, requestedClusterId, "related", name);
    relatedExcludedCount += projected.excludedCount;
    dataQualityWarnings.push(...projected.warnings);
    return { name, excludedCount: projected.excludedCount, items: projected.items };
  });
  assertUnique(related.map(({ name }) => name));
  const projectedEvents = isolateCollection(
    wire.events,
    requestedClusterId,
    "events",
    null,
    "event",
  );
  dataQualityWarnings.push(...projectedEvents.warnings);
  return {
    clusterId: requestedClusterId,
    identity: requestedIdentity,
    resource,
    providerDetail: toProviderResourceDetail(wire.provider_detail),
    access: toResourceAccessDetail(wire.access),
    relatedCompleteness: "unknown",
    related,
    relatedExcludedCount,
    eventsCompleteness: "unknown",
    events: projectedEvents.items,
    eventExcludedCount: projectedEvents.excludedCount,
    dataQualityWarnings,
  };
}

function assertDetailIdentity(
  rawIdentity: Record<string, unknown>,
  expected: ResourceIdentity,
): void {
  const identity = responseRecord(rawIdentity);
  const namespace = identity.namespace;
  if (namespace !== null && namespace !== undefined && typeof namespace !== "string") {
    invalidResponse();
  }
  assertSameResourceType(requiredString(identity, "resource_type"), expected.resourceType);
  assertSameIdentity(requiredString(identity, "kind"), expected.kind);
  assertSameIdentity(requiredString(identity, "name"), expected.name);
  assertSameOptionalIdentity(
    responseOptionalIdentity((namespace ?? null) as string | null),
    expected.namespace,
  );
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") invalidResponse();
  return value;
}

function emptyHealthCounts(): ResourceHealthCounts {
  return { healthy: 0, warning: 0, critical: 0, stale: 0, unknown: 0 };
}
