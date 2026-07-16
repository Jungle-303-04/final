export type GlobalFilterSuggestion =
  | ({ type: "cluster" } & CountedSuggestion)
  | ({ type: "namespace"; clusterId: string } & CountedSuggestion)
  | ({ type: "application" } & CountedSuggestion)
  | ({ type: "resourceType" } & CountedSuggestion)
  | ({ type: "label"; key: string; value: string } & CountedSuggestion)
  | ({
      type: "resource";
      clusterId: string;
      resourceType: string;
      resource: {
        apiGroup: string;
        version: string;
        kind: string;
        namespace: string | null;
        name: string;
        uid: string;
      };
      matchedFields: readonly string[];
    } & CountedSuggestion);

interface CountedSuggestion {
  id: string;
  label: string;
  count: number | null;
  count_completeness: "exact" | "partial" | "unavailable";
}

export interface GlobalFilterSelection {
  clusters: readonly string[];
  namespaces: readonly string[];
  applications: readonly string[];
  resourceTypes: readonly string[];
  labels: readonly string[];
}

export interface GlobalFilterPort {
  search(
    query: string,
    selection: GlobalFilterSelection,
    signal?: AbortSignal,
  ): Promise<readonly GlobalFilterSuggestion[]>;
}

export const EMPTY_GLOBAL_FILTER_PORT: GlobalFilterPort = {
  async search() {
    return [];
  },
};
