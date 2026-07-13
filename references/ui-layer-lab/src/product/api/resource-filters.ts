import { apiRequest, type ApiPath } from "./client";
import {
  filteredInventoryResourceListSchema,
  labelFacetPageSchema,
  resourceFilterFacetPageSchema,
  type FilteredInventoryResourceList,
  type LabelFacetPage,
  type ResourceFilterFacetAxis,
  type ResourceFilterFacetPage,
} from "./resource-filter-schemas";
import { withQuery } from "./url";

export const RESOURCES_FILTER_FACETS_PATH: ApiPath = "/api/resources/filter-facets";
export const FILTERED_RESOURCES_PATH: ApiPath = "/api/resources";
export const RESOURCE_LABEL_FACETS_PATH: ApiPath = "/api/resources/label-facets";

const DEFAULT_PAGE_LIMIT = 50;
const MIN_PAGE_LIMIT = 1;
const MAX_PAGE_LIMIT = 200;
const MAX_AXIS_VALUES = 100;
const MAX_LABEL_SELECTORS = 24;
const MAX_AXIS_TOKEN_LENGTH = 253;
const MAX_NAMESPACE_REFERENCE_LENGTH = 507;
const MAX_LABEL_SELECTOR_LENGTH = 1_024;
const MAX_QUERY_LENGTH = 200;
const MAX_CURSOR_LENGTH = 8_192;

export interface ListResourceFilterFacetsOptions {
  axis: ResourceFilterFacetAxis;
  selected?: readonly string[];
  cursor?: string;
  limit?: number;
}

export interface ResourceFilterQuery {
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

export interface ListResourceLabelFacetsOptions extends ResourceFilterQuery {
  facetQuery?: string;
}

/**
 * Loads one workspace-scoped structural facet page.
 * Backend contract: `RESOURCES_FILTER_FACETS_PATH` / `87c0606e0`.
 */
export function listResourceFilterFacets(
  options: ListResourceFilterFacetsOptions,
  signal?: AbortSignal,
): Promise<ResourceFilterFacetPage> {
  const limit = pageLimit(options.limit);
  const cursor = opaqueCursor(options.cursor);
  const selectedTokenLength = options.axis === "namespaces"
    ? MAX_NAMESPACE_REFERENCE_LENGTH
    : MAX_AXIS_TOKEN_LENGTH;
  const selected = commaSeparated(
    "selected",
    options.selected,
    MAX_AXIS_VALUES,
    selectedTokenLength,
  );
  const path = withQuery(RESOURCES_FILTER_FACETS_PATH, [
    ["axis", options.axis],
    ["selected", selected],
    ["cursor", cursor],
    ["limit", limit],
  ]);
  return apiRequest(path, resourceFilterFacetPageSchema, { signal });
}

/**
 * Lists one server-filtered, cursor-bound Resources page.
 * Backend contract: `FILTERED_RESOURCES_PATH` / `87c0606e0`.
 */
export function listFilteredResources(
  query: ResourceFilterQuery = {},
  signal?: AbortSignal,
): Promise<FilteredInventoryResourceList> {
  const path = withQuery(FILTERED_RESOURCES_PATH, [
    ...resourceFilterEntries(query),
    ["cursor", opaqueCursor(query.cursor)],
    ["limit", pageLimit(query.limit)],
  ]);
  return apiRequest(path, filteredInventoryResourceListSchema, { signal });
}

/**
 * Loads server-counted Label facets for the Resources surface.
 * Backend contract: `RESOURCE_LABEL_FACETS_PATH` / `87c0606e0`.
 */
export function listResourceLabelFacets(
  query: ListResourceLabelFacetsOptions = {},
  signal?: AbortSignal,
): Promise<LabelFacetPage> {
  const path = withQuery(RESOURCE_LABEL_FACETS_PATH, [
    ["surface", "resources"],
    ...resourceFilterEntries(query),
    ["facet_q", boundedQuery("facetQuery", query.facetQuery)],
    ["cursor", opaqueCursor(query.cursor)],
    ["limit", pageLimit(query.limit)],
  ]);
  return apiRequest(path, labelFacetPageSchema, { signal });
}

function resourceFilterEntries(
  query: ResourceFilterQuery,
): Parameters<typeof withQuery>[1] {
  return [
    [
      "clusters",
      commaSeparated(
        "clusters",
        query.clusters,
        MAX_AXIS_VALUES,
        MAX_AXIS_TOKEN_LENGTH,
      ),
    ],
    [
      "namespaces",
      commaSeparated(
        "namespaces",
        query.namespaces,
        MAX_AXIS_VALUES,
        MAX_NAMESPACE_REFERENCE_LENGTH,
      ),
    ],
    [
      "applications",
      commaSeparated(
        "applications",
        query.applications,
        MAX_AXIS_VALUES,
        MAX_AXIS_TOKEN_LENGTH,
      ),
    ],
    [
      "resources.types",
      commaSeparated(
        "resourceTypes",
        query.resourceTypes,
        MAX_AXIS_VALUES,
        MAX_AXIS_TOKEN_LENGTH,
      ),
    ],
    [
      "resources.health",
      commaSeparated(
        "health",
        query.health,
        MAX_AXIS_VALUES,
        MAX_AXIS_TOKEN_LENGTH,
      ),
    ],
    [
      "labels",
      commaSeparated(
        "labels",
        query.labels,
        MAX_LABEL_SELECTORS,
        MAX_LABEL_SELECTOR_LENGTH,
      ),
    ],
    ["resources.q", boundedQuery("query", query.query)],
    ["resources.includeDeleted", query.includeDeleted ?? false],
  ];
}

function commaSeparated(
  name: string,
  values: readonly string[] | undefined,
  maxItems: number,
  maxTokenLength: number,
): string | undefined {
  if (values === undefined || values.length === 0) return undefined;
  if (values.length > maxItems) {
    throw new RangeError(`${name} accepts at most ${maxItems} values`);
  }
  for (const value of values) {
    if (value.trim() === "" || value.includes(",")) {
      throw new TypeError(`${name} values must be non-empty comma-free strings`);
    }
    if (value.length > maxTokenLength) {
      throw new RangeError(`${name} contains a value that exceeds its contract limit`);
    }
  }
  return values.join(",");
}

function boundedQuery(name: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized === "") return undefined;
  if (normalized.length > MAX_QUERY_LENGTH) {
    throw new RangeError(`${name} must not exceed ${MAX_QUERY_LENGTH} characters`);
  }
  return normalized;
}

function opaqueCursor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === "") throw new TypeError("cursor must not be blank");
  if (value.length > MAX_CURSOR_LENGTH) {
    throw new RangeError(`cursor must not exceed ${MAX_CURSOR_LENGTH} characters`);
  }
  return value;
}

function pageLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_PAGE_LIMIT;
  if (!Number.isInteger(limit) || limit < MIN_PAGE_LIMIT || limit > MAX_PAGE_LIMIT) {
    throw new RangeError("limit must be an integer from 1 to 200");
  }
  return limit;
}
