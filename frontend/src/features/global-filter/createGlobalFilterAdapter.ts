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
      const facets = await endpoints.listGlobalFilterFacets(
        {
          ...selection,
          q: query.trim() || undefined,
        },
        signal,
      );
      return flattenFacets(facets);
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
    ...facets.resources.map((item) => ({ type: "resource" as const, ...item })),
  ];
}
