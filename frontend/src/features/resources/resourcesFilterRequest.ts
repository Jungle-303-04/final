import type { UnifiedFilterState } from "../filters/filterContract";
import {
  isKubernetesNamespace,
  isStableFilterValue,
  labelSelector,
  namespaceSelector,
  normalizeLabels,
  normalizeNamespaceRefs,
  normalizeStableList,
  parseLabelSelector,
} from "../filters/filterUrlSyntax";
import type {
  ResourcesFacetPageOptions,
  ResourcesLabelFacetPageOptions,
  ResourcesResourcePageOptions,
} from "./resourcesFilterContract";
import type {
  ResourcesFilterEndpointFacetRequest,
  ResourcesFilterEndpointLabelRequest,
  ResourcesFilterEndpointQuery,
} from "./resourcesFilterEndpointContract";
import type { PhysicalTopologyOptions } from "./physicalTopologyContract";
import type { PhysicalTopologyEndpointQuery } from "./physicalTopologyEndpointContract";
import type { ResourceMetricsHistoryOptions } from "./resourceMetricsHistoryContract";
import type { ResourceMetricsHistoryEndpointQuery } from "./resourceMetricsHistoryEndpointContract";
import type { ChangeTimelineOptions } from "./changeTimelineContract";
import type { ChangeTimelineEndpointQuery } from "./changeTimelineEndpointContract";

export function createResourceFacetRequest(
  state: UnifiedFilterState,
  options: ResourcesFacetPageOptions,
): ResourcesFilterEndpointFacetRequest {
  const selected = selectedFacetValues(state, options.axis);
  return {
    axis: options.axis,
    selected,
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  };
}

export function createFilteredResourcesRequest(
  state: UnifiedFilterState,
  options: ResourcesResourcePageOptions,
): ResourcesFilterEndpointQuery {
  return {
    ...baseFilterQuery(state),
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  };
}

export function createResourceLabelFacetRequest(
  state: UnifiedFilterState,
  options: ResourcesLabelFacetPageOptions,
): ResourcesFilterEndpointLabelRequest {
  const facetQuery = options.facetQuery?.trim();
  return {
    ...baseFilterQuery(state),
    ...(facetQuery === undefined || facetQuery === "" ? {} : { facetQuery }),
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  };
}

export function createPhysicalTopologyRequest(
  state: UnifiedFilterState,
  options: PhysicalTopologyOptions = {},
): PhysicalTopologyEndpointQuery {
  if (state.common.clusters.length !== 1) {
    throw new TypeError("physical topology requires exactly one cluster");
  }
  return {
    ...baseFilterQuery(state),
    ...(options.snapshotRevision === undefined
      ? {}
      : { snapshotRevision: options.snapshotRevision }),
  };
}

export function createResourceMetricsHistoryRequest(
  state: UnifiedFilterState,
  resourceIds: string[],
  options: ResourceMetricsHistoryOptions,
): ResourceMetricsHistoryEndpointQuery {
  return {
    ...baseFilterQuery(state),
    ids: resourceIds,
    snapshotRevision: options.snapshotRevision,
    ...(options.range === undefined ? {} : { range: options.range }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  };
}

export function createChangeTimelineRequest(
  state: UnifiedFilterState,
  options: ChangeTimelineOptions,
): ChangeTimelineEndpointQuery {
  const { includeDeleted: _includeDeleted, ...filters } = baseFilterQuery(state);
  return { ...filters, ...options };
}

function baseFilterQuery(state: UnifiedFilterState): ResourcesFilterEndpointQuery {
  assertStableValues(state.common.clusters);
  assertStableValues(state.common.applications);
  assertStableValues(state.resources.types);
  assertStableValues(state.resources.health);
  assertNamespaces(state);
  assertLabels(state);
  const query = state.resources.query.trim();
  return {
    clusters: normalizeStableList(state.common.clusters),
    namespaces: normalizeNamespaceRefs(state.common.namespaces).map(namespaceSelector),
    applications: normalizeStableList(state.common.applications),
    resourceTypes: normalizeStableList(state.resources.types),
    health: normalizeStableList(state.resources.health),
    labels: normalizeLabels(state.common.labels).map(labelSelector),
    ...(query === "" ? {} : { query }),
    includeDeleted: state.resources.includeDeleted,
  };
}

function selectedFacetValues(
  state: UnifiedFilterState,
  axis: ResourcesFacetPageOptions["axis"],
): readonly string[] {
  if (axis === "namespaces") {
    assertNamespaces(state);
    return normalizeNamespaceRefs(state.common.namespaces).map(namespaceSelector);
  }
  const values = axis === "clusters"
    ? state.common.clusters
    : state.common.applications;
  assertStableValues(values);
  return normalizeStableList(values);
}

function assertStableValues(values: readonly string[]): void {
  if (values.every(isStableFilterValue)) return;
  throw new TypeError("filter values must use the stable canonical grammar");
}

function assertNamespaces(state: UnifiedFilterState): void {
  const valid = state.common.namespaces.every(({ clusterId, namespace }) =>
    isStableFilterValue(clusterId) && isKubernetesNamespace(namespace));
  if (!valid) throw new TypeError("Namespace filters must use Kubernetes grammar");
}

function assertLabels(state: UnifiedFilterState): void {
  const valid = state.common.labels.every((label) => {
    const selector = labelSelector(label);
    const parsed = parseLabelSelector(selector);
    return parsed !== null && parsed.key === label.key && parsed.value === label.value;
  });
  if (!valid) throw new TypeError("Label filters must use Kubernetes grammar");
}
