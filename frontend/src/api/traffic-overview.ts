import { apiRequest } from "./client";
import { canonicalFacetSelections } from "./resource-filter-query";
import { trafficOverviewSchema, type TrafficOverviewEndpoint } from "./traffic-overview-schemas";
import { withQuery } from "./url";

export const TRAFFIC_OVERVIEW_PATH = "/api/traffic/overview" as const;

export interface TrafficOverviewQuery {
  clusterIds?: readonly string[];
  namespaces?: readonly string[];
}

export function getTrafficOverview(
  query: TrafficOverviewQuery = {},
  signal?: AbortSignal,
): Promise<TrafficOverviewEndpoint> {
  return apiRequest(withQuery(TRAFFIC_OVERVIEW_PATH, [
    ["clusters", joined("clusters", query.clusterIds)],
    ["namespaces", joined("namespaces", query.namespaces)],
  ]), trafficOverviewSchema, { signal });
}

function joined(
  axis: "clusters" | "namespaces",
  values: readonly string[] | undefined,
): string | undefined {
  const canonical = canonicalFacetSelections(axis, values);
  return canonical.length === 0 ? undefined : canonical.join(",");
}
