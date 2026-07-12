import type {
  ResourceCatalog,
  ResourceDetail,
  ResourceHealthCounts,
  ResourceIdentity,
  ResourceList,
  ResourceRelatedGroup,
} from "./resourcesContract";
import type {
  ResourcesEndpointInventorySummary,
  ResourcesEndpointResourceDetail,
  ResourcesEndpointResourceList,
} from "./resourcesEndpointContract";
import { toResourceSummary } from "./resourceProjection";
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

export function toResourceCatalog(
  requestedClusterId: string,
  wire: ResourcesEndpointInventorySummary,
): ResourceCatalog {
  assertSameIdentity(wire.cluster_id, requestedClusterId);
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
  return {
    clusterId: requestedClusterId,
    completeness: "unknown",
    observedAt: catalogObservedAt(wire.latest_snapshot),
    items,
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
  const items = wire.resources.map((resource) => {
    const item = toResourceSummary(resource, request.clusterId, {
      expectedResourceType: request.resourceType,
      expectedNamespace: request.namespace,
      enforceNamespace: request.namespace !== null,
    });
    if (!request.includeDeleted && item.deletedAt !== null) invalidResponse();
    return item;
  });
  assertResourceCollection(items);
  return {
    clusterId: request.clusterId,
    resourceType: request.resourceType,
    namespace: request.namespace,
    includeDeleted: request.includeDeleted,
    completeness: "unknown",
    limit: request.limit,
    returned: items.length,
    limitReached: items.length === request.limit,
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
  const resource = toResourceSummary(wire.resource, requestedClusterId, {
    expectedResourceType: requestedIdentity.resourceType,
    expectedNamespace: requestedIdentity.namespace,
    enforceNamespace: true,
  });
  assertSameIdentity(resource.kind, requestedIdentity.kind);
  assertSameIdentity(resource.name, requestedIdentity.name);
  const related: ResourceRelatedGroup[] = Object.entries(wire.related).map(
    ([name, resources]) => {
      const items = resources.map((item) => toResourceSummary(item, requestedClusterId));
      assertResourceCollection(items);
      return { name: responseIdentity(name), items };
    },
  );
  assertUnique(related.map(({ name }) => name));
  const events = wire.events.map((event) => toResourceSummary(event, requestedClusterId, {
    expectedResourceType: "event",
  }));
  assertResourceCollection(events);
  return {
    clusterId: requestedClusterId,
    identity: requestedIdentity,
    resource,
    relatedCompleteness: "unknown",
    related,
    eventsCompleteness: "unknown",
    events,
  };
}

function assertResourceCollection(
  items: Array<{ id: string; inventoryKey: string }>,
): void {
  assertUnique(items.map(({ id }) => id));
  assertUnique(items.map(({ inventoryKey }) => inventoryKey));
}

function catalogObservedAt(snapshot: Record<string, unknown> | null): string | null {
  return snapshot === null ? null : responseTimestamp(responseRecord(snapshot).collected_at);
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
