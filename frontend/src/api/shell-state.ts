import { apiRequest, type ApiPath } from "./client";
import {
  namespaceScopeSchema,
  namespaceScopeUpdateSchema,
  resourceIdentitySearchSchema,
  uiPreferencesSchema,
  uiPreferencesUpdateSchema,
  type NamespaceScope,
  type ResourceIdentitySearch,
  type UiPreferencesResponse,
} from "./shell-state-schemas";
import {
  boundedQuery,
  canonicalFacetSelections,
  canonicalLabelSelections,
  canonicalResourceTypeSelections,
} from "./resource-filter-query";
import { withQuery } from "./url";

export const NAMESPACE_SCOPE_PATH: ApiPath = "/api/cluster/namespace-scope";
export const NAMESPACE_UPDATE_PATH: ApiPath = "/api/cluster/namespace";
export const SETTINGS_PATH: ApiPath = "/api/settings";
export const RESOURCE_SEARCH_PATH: ApiPath = "/api/search";

export interface ResourceIdentitySearchQuery {
  q: string;
  clusters?: readonly string[];
  namespaces?: readonly string[];
  applications?: readonly string[];
  resourceTypes?: readonly string[];
  labels?: readonly string[];
  limit?: number;
}

export function getNamespaceScope(
  clusterId: string,
  signal?: AbortSignal,
): Promise<NamespaceScope> {
  return apiRequest(
    withQuery(NAMESPACE_SCOPE_PATH, [["cluster_id", clusterId]]),
    namespaceScopeSchema,
    { signal },
  );
}

export function updateNamespaceScope(
  input: { clusterId: string; namespaces: readonly string[]; expectedRevision: number },
  signal?: AbortSignal,
): Promise<NamespaceScope> {
  return apiRequest(NAMESPACE_UPDATE_PATH, namespaceScopeUpdateSchema, {
    body: JSON.stringify({
      cluster_id: input.clusterId,
      namespaces: [...input.namespaces],
      expected_revision: input.expectedRevision,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  });
}

export function getUiPreferences(signal?: AbortSignal): Promise<UiPreferencesResponse> {
  return apiRequest(SETTINGS_PATH, uiPreferencesSchema, { signal });
}

export function updateUiPreferences(
  input: {
    preferences: UiPreferencesResponse["preferences"];
    expectedRevision: number;
  },
  signal?: AbortSignal,
): Promise<UiPreferencesResponse> {
  return apiRequest(SETTINGS_PATH, uiPreferencesUpdateSchema, {
    body: JSON.stringify({
      preferences: input.preferences,
      expected_revision: input.expectedRevision,
    }),
    headers: { "content-type": "application/json" },
    method: "PUT",
    signal,
  });
}

export function searchResourceIdentities(
  query: ResourceIdentitySearchQuery,
  signal?: AbortSignal,
): Promise<ResourceIdentitySearch> {
  return apiRequest(
    withQuery(RESOURCE_SEARCH_PATH, [
      ["q", boundedQuery("q", query.q)],
      ["clusters", join(canonicalFacetSelections("clusters", query.clusters))],
      ["namespaces", join(canonicalFacetSelections("namespaces", query.namespaces))],
      ["applications", join(canonicalFacetSelections("applications", query.applications))],
      ["resources.types", join(canonicalResourceTypeSelections(query.resourceTypes))],
      ["labels", join(canonicalLabelSelections(query.labels))],
      ["include", "none"],
      ["globalNs", true],
      ["limit", query.limit ?? 12],
    ]),
    resourceIdentitySearchSchema,
    { signal },
  );
}

function join(values: readonly string[]): string | undefined {
  return values.length === 0 ? undefined : values.join(",");
}
