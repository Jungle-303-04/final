import type { ProviderResourceDetailEndpoint } from "./providerResourceEndpointContract";

export type ResourcesEndpointJsonMap = Record<string, unknown>;

export interface ResourcesEndpointInventorySummary {
  cluster_id: string;
  latest_snapshot: ResourcesEndpointJsonMap | null;
  counts: ResourcesEndpointJsonMap[];
}

export interface ResourcesEndpointResource {
  inventory_key: string;
  snapshot_id: string;
  workspace_id: string;
  cluster_id: string;
  resource_type: string;
  api_version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string | null;
  resource_version: string | null;
  status: string;
  health: string;
  labels: ResourcesEndpointJsonMap;
  annotations: ResourcesEndpointJsonMap;
  summary: ResourcesEndpointJsonMap;
  observed_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ResourcesEndpointResourceList {
  cluster_id: string;
  resource_type: string | null;
  resources: ResourcesEndpointResource[];
}

export interface ResourcesEndpointResourceDetail {
  cluster_id: string;
  identity: ResourcesEndpointJsonMap;
  resource: ResourcesEndpointResource;
  provider_detail?: ProviderResourceDetailEndpoint | null;
  related: Record<string, ResourcesEndpointResource[]>;
  events: ResourcesEndpointResource[];
}

export interface ResourcesEndpointListQuery {
  resourceType: string;
  namespace?: string | null;
  includeDeleted?: boolean;
  limit?: number;
}

export interface ResourcesEndpointResourceIdentity {
  resourceType: string;
  kind: string;
  name: string;
  namespace?: string | null;
}

export interface ResourcesEndpointDetailOptions {
  relatedLimit?: number;
  eventLimit?: number;
}

export interface ResourcesEndpointDependencies {
  getInventorySummary(
    clusterId: string,
    signal?: AbortSignal,
  ): Promise<ResourcesEndpointInventorySummary>;
  listInventoryResourcesByType(
    clusterId: string,
    query: ResourcesEndpointListQuery,
    signal?: AbortSignal,
  ): Promise<ResourcesEndpointResourceList>;
  getInventoryResourceDetail(
    clusterId: string,
    identity: ResourcesEndpointResourceIdentity,
    options?: ResourcesEndpointDetailOptions,
    signal?: AbortSignal,
  ): Promise<ResourcesEndpointResourceDetail>;
}
