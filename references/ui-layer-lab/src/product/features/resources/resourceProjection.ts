import type { ResourceSummary } from "./resourcesContract";
import type { ResourcesEndpointResource } from "./resourcesEndpointContract";
import { toResourceFacts } from "./resourceFacts";
import type { ResourceFactWarningSink } from "./resourceFactSafety";
import {
  assertSameIdentity,
  assertSameOptionalIdentity,
  assertSameResourceType,
  healthTone,
  resourceId,
  responseIdentity,
  responseOptionalIdentity,
  responseResourceType,
  responseText,
  responseTimestamp,
} from "./resourcesValidation";

export interface ResourceExpectations {
  expectedResourceType?: string;
  expectedNamespace?: string | null;
  enforceNamespace?: boolean;
}

export function toResourceSummary(
  wire: ResourcesEndpointResource,
  expectedClusterId: string,
  expectations: ResourceExpectations = {},
  warnFact?: ResourceFactWarningSink,
): ResourceSummary {
  assertSameIdentity(wire.cluster_id, expectedClusterId);
  const resourceType = responseResourceType(wire.resource_type);
  if (expectations.expectedResourceType !== undefined) {
    assertSameResourceType(resourceType, expectations.expectedResourceType);
  }
  const namespace = responseOptionalIdentity(wire.namespace);
  if (expectations.enforceNamespace === true) {
    assertSameOptionalIdentity(namespace, expectations.expectedNamespace ?? null);
  }

  const inventoryKey = responseIdentity(wire.inventory_key);
  responseIdentity(wire.snapshot_id);
  responseIdentity(wire.workspace_id);
  const apiVersion = responseText(wire.api_version);
  const kind = responseIdentity(wire.kind);
  const name = responseIdentity(wire.name);
  const uid = responseOptionalIdentity(wire.uid);
  responseOptionalIdentity(wire.resource_version);
  const status = responseIdentity(wire.status);
  const healthStatus = responseIdentity(wire.health);
  responseTimestamp(wire.created_at);
  responseTimestamp(wire.updated_at);

  return {
    id: resourceId(expectedClusterId, uid, [resourceType, namespace ?? "", kind, name]),
    identityStability: uid === null ? "fallback" : "uid",
    inventoryKey,
    uid,
    clusterId: expectedClusterId,
    resourceType,
    apiVersion,
    kind,
    namespace,
    name,
    status,
    health: healthTone(healthStatus),
    healthStatus,
    facts: toResourceFacts(resourceType, wire.summary, warnFact),
    observedAt: responseTimestamp(wire.observed_at),
    firstSeenAt: responseTimestamp(wire.first_seen_at),
    lastSeenAt: responseTimestamp(wire.last_seen_at),
    deletedAt: responseTimestamp(wire.deleted_at),
  };
}
