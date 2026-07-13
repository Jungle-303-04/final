import type { UnifiedFilterState } from "../filters/filterContract";
import type {
  ResourceDataQualityWarning,
  ResourceSummary,
} from "./resourcesContract";

export type ResourcesFilterCompleteness = "exact" | "partial" | "unavailable";
export type ResourcesFilterFacetAxis = "clusters" | "namespaces" | "applications";
export type ResourcesFilterFacetAvailability =
  | "available"
  | "restricted"
  | "unresolved";

export interface ResourcesFilterSnapshot {
  snapshotRevision: number;
  authorizationRevision: string;
  filterFingerprint: string;
  observedAt: string | null;
  stale: boolean;
  partialReasonCodes: string[];
}

export interface ResourcesFilterCounts {
  filteredCount: number | null;
  unfilteredCount: number | null;
  filteredCountCompleteness: ResourcesFilterCompleteness;
  unfilteredCountCompleteness: ResourcesFilterCompleteness;
}

export type ResourcesFilterFacetItem =
  | {
      axis: "cluster";
      value: string;
      clusterId: string;
      name: string | null;
      provider: string | null;
      availability: ResourcesFilterFacetAvailability;
    }
  | {
      axis: "namespace";
      value: string;
      clusterId: string;
      namespace: string;
      availability: ResourcesFilterFacetAvailability;
    }
  | {
      axis: "application";
      value: string;
      applicationId: string;
      name: string | null;
      environment: string | null;
      availability: ResourcesFilterFacetAvailability;
    };

export interface ResourcesFilterSelectedResolution {
  axis: "cluster" | "namespace" | "application";
  value: string;
  status: "resolved" | "restricted" | "unresolved" | "unavailable";
  displayLabel: string | null;
}

export interface ResourcesFilterFacetPage {
  axis: ResourcesFilterFacetAxis;
  items: ResourcesFilterFacetItem[];
  selectedResolutions: ResourcesFilterSelectedResolution[];
  nextCursor: string | null;
  hasMore: boolean;
  snapshot: ResourcesFilterSnapshot;
}

export interface ResourcesFilterResourceItem {
  resource: ResourceSummary;
  cluster: {
    clusterId: string;
    name: string | null;
    provider: string | null;
  };
  applicationIds: string[];
  applicationBindingCompleteness: ResourcesFilterCompleteness;
}

export interface ResourcesFilterResourcePage {
  items: ResourcesFilterResourceItem[];
  nextCursor: string | null;
  hasMore: boolean;
  counts: ResourcesFilterCounts;
  snapshot: ResourcesFilterSnapshot;
  excludedCount: number;
  dataQualityWarnings: ResourceDataQualityWarning[];
}

export interface ResourcesFilterLabelFacetItem {
  key: string;
  value: string;
  selector: string;
  matchCount: number | null;
  countCompleteness: ResourcesFilterCompleteness;
}

export interface ResourcesFilterSelectedLabelResolution {
  key: string;
  value: string;
  selector: string;
  status: "resolved" | "zero" | "restricted" | "unavailable";
}

export interface ResourcesFilterLabelFacetPage {
  surface: "resources";
  items: ResourcesFilterLabelFacetItem[];
  selectedResolutions: ResourcesFilterSelectedLabelResolution[];
  nextCursor: string | null;
  hasMore: boolean;
  counts: ResourcesFilterCounts;
  snapshot: ResourcesFilterSnapshot;
}

export interface ResourcesFacetPageOptions {
  axis: ResourcesFilterFacetAxis;
  cursor?: string;
  limit?: number;
}

export interface ResourcesResourcePageOptions {
  cursor?: string;
  limit?: number;
}

export interface ResourcesLabelFacetPageOptions extends ResourcesResourcePageOptions {
  facetQuery?: string;
}

export interface ResourcesFilterPort {
  listFacetPage(
    state: UnifiedFilterState,
    options: ResourcesFacetPageOptions,
    signal?: AbortSignal,
  ): Promise<ResourcesFilterFacetPage>;
  listResourcePage(
    state: UnifiedFilterState,
    options: ResourcesResourcePageOptions,
    signal?: AbortSignal,
  ): Promise<ResourcesFilterResourcePage>;
  listLabelFacetPage(
    state: UnifiedFilterState,
    options: ResourcesLabelFacetPageOptions,
    signal?: AbortSignal,
  ): Promise<ResourcesFilterLabelFacetPage>;
}
