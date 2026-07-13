import type {
  ResourceIdentity,
  ResourceListQuery,
} from "./resourcesContract";
import {
  requestIdentity,
  requestLimit,
  requestOptionalIdentity,
  requestResourceType,
} from "./resourcesValidation";

const DEFAULT_LIST_LIMIT = 200;
export const RESOURCE_RELATED_LIMIT = 100;
export const RESOURCE_EVENT_LIMIT = 50;

export interface CanonicalResourceListRequest {
  clusterId: string;
  resourceType: string;
  namespace: string | null;
  includeDeleted: boolean;
  limit: number;
}

export function canonicalClusterRequest(clusterId: string): string {
  return requestIdentity(clusterId);
}

export function canonicalListRequest(
  clusterId: string,
  query: ResourceListQuery,
): CanonicalResourceListRequest {
  return {
    clusterId: requestIdentity(clusterId),
    resourceType: requestResourceType(query.resourceType),
    namespace: requestOptionalIdentity(query.namespace),
    includeDeleted: query.includeDeleted ?? false,
    limit: requestLimit(query.limit, DEFAULT_LIST_LIMIT),
  };
}

export function canonicalDetailRequest(
  clusterId: string,
  identity: ResourceIdentity,
): { clusterId: string; identity: ResourceIdentity } {
  return {
    clusterId: requestIdentity(clusterId),
    identity: {
      resourceType: requestResourceType(identity.resourceType),
      kind: requestIdentity(identity.kind),
      namespace: requestOptionalIdentity(identity.namespace),
      name: requestIdentity(identity.name),
    },
  };
}
