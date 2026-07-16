import { apiRequest } from "./client";
import { costNodePageSchema, type CostNodePageEndpoint } from "./cost-nodes-schemas";
import { canonicalFacetSelections, opaqueCursor, pageLimit } from "./resource-filter-query";
import { withQuery } from "./url";

export const COST_NODES_PATH = "/api/cost/nodes" as const;

export interface CostNodesQuery {
  clusterIds?: readonly string[];
  namespaces?: readonly string[];
  cursor?: string;
  limit?: number;
}

export function getCostNodes(
  query: CostNodesQuery = {},
  signal?: AbortSignal,
): Promise<CostNodePageEndpoint> {
  const clusters = canonicalFacetSelections("clusters", query.clusterIds);
  const namespaces = canonicalFacetSelections("namespaces", query.namespaces);
  return apiRequest(withQuery(COST_NODES_PATH, [
    ["clusters", clusters.length > 0 ? clusters.join(",") : undefined],
    ["namespaces", namespaces.length > 0 ? namespaces.join(",") : undefined],
    ["cursor", opaqueCursor(query.cursor)],
    ["limit", pageLimit(query.limit)],
  ]), costNodePageSchema, { signal });
}
