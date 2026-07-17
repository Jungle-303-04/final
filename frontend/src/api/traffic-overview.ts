import { apiRequest } from "./client";
import { canonicalFacetSelections } from "./resource-filter-query";
import { trafficOverviewSchema, type TrafficOverviewEndpoint } from "./traffic-overview-schemas";
import { withQuery } from "./url";

export const TRAFFIC_FLOWS_PATH = "/api/traffic/flows" as const;

export interface TrafficOverviewQuery {
  clusterIds?: readonly string[];
  namespaces?: readonly string[];
  since?: "1m" | "5m" | "15m" | "1h";
  protocols?: readonly ("tcp" | "udp" | "http" | "grpc" | "dns" | "unknown")[];
  verdicts?: readonly ("forwarded" | "dropped" | "error" | "unknown")[];
  sort?: "connections" | "last_seen" | "source" | "destination";
  order?: "asc" | "desc";
  cursor?: string;
  limit?: number;
}

export function getTrafficOverview(
  query: TrafficOverviewQuery = {},
  signal?: AbortSignal,
): Promise<TrafficOverviewEndpoint> {
  return apiRequest(withQuery(TRAFFIC_FLOWS_PATH, [
    ["clusters", joined("clusters", query.clusterIds)],
    ["namespaces", joined("namespaces", query.namespaces)],
    ["since", query.since === undefined || query.since === "5m" ? undefined : query.since],
    ["protocols", enumValues(query.protocols)],
    ["verdicts", enumValues(query.verdicts)],
    ["sort", query.sort === undefined || query.sort === "connections" ? undefined : query.sort],
    ["order", query.order === undefined || query.order === "desc" ? undefined : query.order],
    ["cursor", query.cursor],
    ["limit", query.limit === undefined || query.limit === 50 ? undefined : String(query.limit)],
  ]), trafficOverviewSchema, { signal });
}

function enumValues(values: readonly string[] | undefined): string | undefined {
  const normalized = [...new Set(values ?? [])].sort();
  return normalized.length === 0 ? undefined : normalized.join(",");
}

function joined(
  axis: "clusters" | "namespaces",
  values: readonly string[] | undefined,
): string | undefined {
  const canonical = canonicalFacetSelections(axis, values);
  return canonical.length === 0 ? undefined : canonical.join(",");
}
