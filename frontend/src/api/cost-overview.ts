import { apiRequest } from "./client";
import { canonicalFacetSelections } from "./resource-filter-query";
import { costOverviewSchema, type CostOverviewEndpoint } from "./cost-overview-schemas";
import { withQuery } from "./url";

export const COST_OVERVIEW_PATH = "/api/cost/overview" as const;

export interface CostOverviewQuery {
  clusterIds?: readonly string[];
  namespaces?: readonly string[];
  timeRange?: "6h" | "24h" | "7d";
}

export function getCostOverview(
  query: CostOverviewQuery = {},
  signal?: AbortSignal,
): Promise<CostOverviewEndpoint> {
  const clusterIds = canonicalFacetSelections("clusters", query.clusterIds);
  const namespaces = canonicalFacetSelections("namespaces", query.namespaces);
  return apiRequest(withQuery(COST_OVERVIEW_PATH, [
    ["clusters", clusterIds.length === 0 ? undefined : clusterIds.join(",")],
    ["namespaces", namespaces.length === 0 ? undefined : namespaces.join(",")],
    ["range", query.timeRange],
  ]), costOverviewSchema, { signal });
}
