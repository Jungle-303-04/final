import type { ResourcesEndpointResource } from "./resourcesEndpointContract";

export type ResourcesFilterEndpointCompleteness = "exact" | "partial" | "unavailable";
export type ResourcesFilterEndpointFacetAxis = "clusters" | "namespaces" | "applications";

export interface ResourcesFilterEndpointQuery {
  clusters?: readonly string[];
  namespaces?: readonly string[];
  applications?: readonly string[];
  resourceTypes?: readonly string[];
  health?: readonly string[];
  labels?: readonly string[];
  query?: string;
  includeDeleted?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ResourcesFilterEndpointFacetRequest {
  axis: ResourcesFilterEndpointFacetAxis;
  selected?: readonly string[];
  cursor?: string;
  limit?: number;
}

export interface ResourcesFilterEndpointLabelRequest extends ResourcesFilterEndpointQuery {
  facetQuery?: string;
}

export interface ResourcesFilterEndpointSnapshot {
  snapshot_revision: number;
  authorization_revision: string;
  filter_fingerprint: string;
  observed_at: string | null;
  stale: boolean;
  partial_reason_codes: string[];
}

interface ResourcesFilterEndpointCounts {
  filtered_count: number | null;
  unfiltered_count: number | null;
  filtered_count_completeness: ResourcesFilterEndpointCompleteness;
  unfiltered_count_completeness: ResourcesFilterEndpointCompleteness;
}

type ResourcesFilterEndpointFacetItem =
  | {
      axis: "cluster";
      value: string;
      cluster_id: string;
      name: string | null;
      provider: string | null;
      availability: "available" | "restricted" | "unresolved";
    }
  | {
      axis: "namespace";
      value: string;
      cluster_id: string;
      namespace: string;
      availability: "available" | "restricted" | "unresolved";
    }
  | {
      axis: "application";
      value: string;
      application_id: string;
      name: string | null;
      environment: string | null;
      availability: "available" | "restricted" | "unresolved";
    };

interface ResourcesFilterEndpointSelectedResolution {
  axis: "cluster" | "namespace" | "application";
  value: string;
  status: "resolved" | "restricted" | "unresolved" | "unavailable";
  display_label: string | null;
}

export interface ResourcesFilterEndpointFacetPage {
  axis: ResourcesFilterEndpointFacetAxis;
  items: ResourcesFilterEndpointFacetItem[];
  selected_resolutions: ResourcesFilterEndpointSelectedResolution[];
  next_cursor: string | null;
  has_more: boolean;
  snapshot: ResourcesFilterEndpointSnapshot;
}

export interface ResourcesFilterEndpointResourceItem {
  resource: ResourcesEndpointResource;
  cluster: {
    cluster_id: string;
    name: string | null;
    provider: string | null;
  };
  application_ids: string[];
  application_binding_completeness: ResourcesFilterEndpointCompleteness;
  metrics?: ResourcesFilterEndpointTableMetrics | null;
}

interface ResourcesFilterEndpointMetricEvidence {
  resource_uid: string | null;
  source_snapshot_id: string;
  observed_at: string | null;
  measurement_window: string | null;
  cpu_mcores: number | null;
  memory_mib: number | null;
  completeness: ResourcesFilterEndpointCompleteness;
  reason_codes: string[];
}

export interface ResourcesFilterEndpointPodMetrics
  extends ResourcesFilterEndpointMetricEvidence {
  kind: "pod";
  cpu_request_mcores: number | null;
  cpu_limit_mcores: number | null;
  memory_request_mib: number | null;
  memory_limit_mib: number | null;
}

export interface ResourcesFilterEndpointNodeMetrics
  extends ResourcesFilterEndpointMetricEvidence {
  kind: "node";
  cpu_allocatable_mcores: number | null;
  memory_allocatable_mib: number | null;
  pod_count: number | null;
  pod_allocatable: number | null;
}

export type ResourcesFilterEndpointTableMetrics =
  | ResourcesFilterEndpointPodMetrics
  | ResourcesFilterEndpointNodeMetrics;

export interface ResourcesFilterEndpointResourcePage {
  items: ResourcesFilterEndpointResourceItem[];
  next_cursor: string | null;
  has_more: boolean;
  counts: ResourcesFilterEndpointCounts;
  snapshot: ResourcesFilterEndpointSnapshot;
}

interface ResourcesFilterEndpointLabelFacetItem {
  key: string;
  value: string;
  selector: string;
  match_count: number | null;
  count_completeness: ResourcesFilterEndpointCompleteness;
}

interface ResourcesFilterEndpointSelectedLabelResolution {
  key: string;
  value: string;
  selector: string;
  status: "resolved" | "zero" | "restricted" | "unavailable";
}

export interface ResourcesFilterEndpointLabelPage {
  surface: "resources";
  items: ResourcesFilterEndpointLabelFacetItem[];
  selected_resolutions: ResourcesFilterEndpointSelectedLabelResolution[];
  next_cursor: string | null;
  has_more: boolean;
  counts: ResourcesFilterEndpointCounts;
  snapshot: ResourcesFilterEndpointSnapshot;
}

export interface ResourcesFilterEndpointDependencies {
  listResourceFilterFacets(
    options: ResourcesFilterEndpointFacetRequest,
    signal?: AbortSignal,
  ): Promise<ResourcesFilterEndpointFacetPage>;
  listFilteredResources(
    query?: ResourcesFilterEndpointQuery,
    signal?: AbortSignal,
  ): Promise<ResourcesFilterEndpointResourcePage>;
  listResourceLabelFacets(
    query?: ResourcesFilterEndpointLabelRequest,
    signal?: AbortSignal,
  ): Promise<ResourcesFilterEndpointLabelPage>;
}
