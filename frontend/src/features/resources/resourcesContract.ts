export type ResourcesCollectionCompleteness = "unknown";

export type ResourceHealthTone =
  | "healthy"
  | "warning"
  | "critical"
  | "stale"
  | "unknown";

export type ResourceIdentityStability = "uid" | "fallback";

export type ResourceDataQualityWarningCode =
  | "optional-fact-unavailable"
  | "invalid-resource-excluded"
  | "duplicate-resource-excluded";

export type ResourceDataQualitySection =
  | "resource"
  | "list"
  | "related"
  | "events";

export interface ResourceDataQualityWarning {
  code: ResourceDataQualityWarningCode;
  section: ResourceDataQualitySection;
  field: string | null;
  rowIndex: number | null;
  group: string | null;
}

export interface ResourceHealthCounts {
  healthy: number;
  warning: number;
  critical: number;
  stale: number;
  unknown: number;
}

export interface ResourceCatalogItem {
  resourceType: string;
  count: number;
  healthCounts: ResourceHealthCounts;
}

export interface ResourceCatalog {
  clusterId: string;
  completeness: ResourcesCollectionCompleteness;
  observedAt: string | null;
  items: ResourceCatalogItem[];
}

export interface ResourceMetadataEntry {
  key: string;
  value: string;
}

export interface ResourceOwnerFact {
  kind: string;
  name: string;
}

export interface ResourceReadinessFact {
  ready: number;
  total: number;
}

export interface ResourcePortFact {
  name: string | null;
  protocol: string | null;
  port: number | null;
  targetPort: string | null;
  nodePort: number | null;
}

export interface ResourceInvolvedFact {
  kind: string;
  name: string;
  uid: string | null;
}

export type ResourceFacts =
  | {
      type: "pod";
      phase: string | null;
      nodeName: string | null;
      owner: ResourceOwnerFact | null;
      readiness: ResourceReadinessFact | null;
      restartCount: number | null;
      cpuMillicores: number | null;
      memoryMebibytes: number | null;
      podIp: string | null;
      hostIp: string | null;
      waitingReasons: string[];
      terminatedReasons: string[];
    }
  | {
      type: "node";
      ready: boolean | null;
      podCapacity: number | null;
      cpuMillicores: number | null;
      memoryMebibytes: number | null;
      cpuRatio: number | null;
      memoryRatio: number | null;
    }
  | {
      type: "workload";
      desiredReplicas: number | null;
      readyReplicas: number | null;
      availableReplicas: number | null;
      updatedReplicas: number | null;
      unavailableReplicas: number | null;
      generation: number | null;
      observedGeneration: number | null;
    }
  | {
      type: "service";
      serviceType: string | null;
      clusterIp: string | null;
      externalUrl: string | null;
      externalHosts: string[];
      selector: ResourceMetadataEntry[];
      ports: ResourcePortFact[];
    }
  | {
      type: "event";
      eventType: string | null;
      reason: string | null;
      message: string | null;
      occurrenceCount: number | null;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
      reportingComponent: string | null;
      involvedResource: ResourceInvolvedFact | null;
    }
  | { type: "generic" };

export interface ResourceSummary {
  id: string;
  identityStability: ResourceIdentityStability;
  inventoryKey: string;
  uid: string | null;
  clusterId: string;
  resourceType: string;
  apiVersion: string;
  kind: string;
  namespace: string | null;
  name: string;
  status: string;
  health: ResourceHealthTone;
  healthStatus: string;
  facts: ResourceFacts;
  observedAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  deletedAt: string | null;
}

export interface ResourceListQuery {
  resourceType: string;
  namespace?: string | null;
  includeDeleted?: boolean;
  limit?: number;
}

export interface ResourceList {
  clusterId: string;
  resourceType: string;
  namespace: string | null;
  includeDeleted: boolean;
  completeness: ResourcesCollectionCompleteness;
  limit: number;
  returned: number;
  limitReached: boolean;
  /** Canonical adapters always populate diagnostics; optional keeps external port fixtures additive. */
  excludedCount?: number;
  dataQualityWarnings?: ResourceDataQualityWarning[];
  items: ResourceSummary[];
}

export interface ResourceIdentity {
  resourceType: string;
  kind: string;
  namespace: string | null;
  name: string;
}

export interface ResourceRelatedGroup {
  name: string;
  /** Canonical adapters always report how many malformed rows were isolated. */
  excludedCount?: number;
  items: ResourceSummary[];
}

export interface ResourceDetail {
  clusterId: string;
  identity: ResourceIdentity;
  resource: ResourceSummary;
  relatedCompleteness: ResourcesCollectionCompleteness;
  related: ResourceRelatedGroup[];
  relatedExcludedCount?: number;
  eventsCompleteness: ResourcesCollectionCompleteness;
  events: ResourceSummary[];
  eventExcludedCount?: number;
  dataQualityWarnings?: ResourceDataQualityWarning[];
}

export type ResourcesFailureCode =
  | "unauthorized"
  | "forbidden"
  | "offline"
  | "not-found"
  | "invalid-request"
  | "rate-limited"
  | "unavailable"
  | "invalid-response"
  | "error";

export class ResourcesPortFailure extends Error {
  readonly code: ResourcesFailureCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: ResourcesFailureCode, retryAfterSeconds: number | null = null) {
    super(`Resources port failed: ${code}`);
    this.name = "ResourcesPortFailure";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface ResourcesPort {
  loadCatalog(clusterId: string, signal?: AbortSignal): Promise<ResourceCatalog>;
  listResources(
    clusterId: string,
    query: ResourceListQuery,
    signal?: AbortSignal,
  ): Promise<ResourceList>;
  loadResourceDetail(
    clusterId: string,
    identity: ResourceIdentity,
    signal?: AbortSignal,
  ): Promise<ResourceDetail>;
}
