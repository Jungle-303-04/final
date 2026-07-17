import type {
  GlobalFilterPort,
  GlobalFilterSelection,
  GlobalFilterSuggestion,
} from "./globalFilterContract";

interface GlobalFilterEndpoints {
  listGlobalFilterFacets(
    query: GlobalFilterSelection & { q?: string },
    signal?: AbortSignal,
  ): Promise<GlobalFilterFacetsPayload>;
  searchResourceIdentities?(
    query: GlobalFilterSelection & { q: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<ResourceIdentitySearchPayload>;
}

interface ResourceIdentitySearchPayload {
  hits: {
    id: string;
    cluster_id: string;
    resource_type: string;
    resource: {
      api_group: string;
      version: string;
      kind: string;
      namespace: string | null;
      name: string;
      uid: string;
    };
    matched_fields: string[];
  }[];
}

interface CountedFacetPayload {
  id: string;
  label: string;
  count: number | null;
  count_completeness: "exact" | "partial" | "unavailable";
}

interface GlobalFilterFacetsPayload {
  clusters: CountedFacetPayload[];
  namespaces: (CountedFacetPayload & { cluster_id: string })[];
  applications: CountedFacetPayload[];
  resource_types: CountedFacetPayload[];
  labels: {
    key: string;
    value: string;
    count: number | null;
    count_completeness: "exact" | "partial" | "unavailable";
  }[];
  resources: (CountedFacetPayload & { kind: string })[];
}

export function createGlobalFilterAdapter(
  endpoints: GlobalFilterEndpoints,
): GlobalFilterPort {
  return {
    async search(query, selection, signal) {
      const normalizedQuery = query.trim();
      const [facets, identities] = await Promise.all([
        endpoints.listGlobalFilterFacets(
          { ...selection, q: normalizedQuery || undefined },
          signal,
        ),
        normalizedQuery.length >= 2 && endpoints.searchResourceIdentities
          ? endpoints.searchResourceIdentities(
              { ...selection, q: normalizedQuery, limit: 12 },
              signal,
            )
          : Promise.resolve({ hits: [] }),
      ]);
      return [
        ...flattenFacets({ ...facets, resources: [] }),
        ...identities.hits.map((hit) => ({
          type: "resource" as const,
          id: hit.id,
          label: hit.resource.name,
          count: 1,
          count_completeness: "exact" as const,
          clusterId: hit.cluster_id,
          resourceType: hit.resource_type,
          resource: {
            apiGroup: hit.resource.api_group,
            version: hit.resource.version,
            kind: hit.resource.kind,
            namespace: hit.resource.namespace,
            name: hit.resource.name,
            uid: hit.resource.uid,
          },
          matchedFields: hit.matched_fields,
        })),
      ];
    },
  };
}

function flattenFacets(
  facets: GlobalFilterFacetsPayload,
): readonly GlobalFilterSuggestion[] {
  return [
    ...facets.clusters.map((item) => ({ type: "cluster" as const, ...item })),
    ...facets.namespaces.map(({ cluster_id, ...item }) => ({
      type: "namespace" as const,
      clusterId: cluster_id,
      ...item,
    })),
    ...facets.applications.map((item) => ({
      type: "application" as const,
      ...item,
    })),
    ...facets.resource_types.map((item) => ({
      type: "resourceType" as const,
      ...item,
    })),
    ...facets.labels.map((item) => ({
      type: "label" as const,
      id: `${item.key}=${item.value}`,
      label: `${item.key}=${item.value}`,
      ...item,
    })),
  ];
}
