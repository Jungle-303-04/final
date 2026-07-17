import { apiRequest } from "./client";
import { rightsizingScanSchema, type RightsizingScanEndpoint } from "./rightsizing-schemas";
import { withQuery } from "./url";

export const RIGHTSIZING_SCAN_PATH = "/api/rightsizing/workloads" as const;
export const RIGHTSIZING_SCAN_LIMIT = 200;

export interface RightsizingScanQuery {
  clusterId: string;
  namespaces: readonly string[];
  limit?: number;
}

export function getRightsizingScan(
  query: RightsizingScanQuery,
  signal?: AbortSignal,
): Promise<RightsizingScanEndpoint> {
  const clusterId = required(query.clusterId, "cluster ID");
  const namespaces = canonicalNamespaces(query.namespaces);
  const limit = query.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > RIGHTSIZING_SCAN_LIMIT) {
    throw new RangeError("Rightsizing scan limit is invalid");
  }
  return apiRequest(withQuery(RIGHTSIZING_SCAN_PATH, [
    ["cluster_id", clusterId],
    ["namespaces", namespaces.length === 0 ? undefined : namespaces.join(",")],
    ["limit", String(limit)],
  ]), rightsizingScanSchema, { signal });
}

export function canonicalNamespaces(namespaces: readonly string[]): readonly string[] {
  if (namespaces.length > 100) throw new RangeError("Too many rightsizing namespaces");
  const normalized = namespaces.map((namespace) => required(namespace, "namespace"));
  if (normalized.some((namespace) =>
    namespace.length > 63 ||
    namespace.includes(",") ||
    !/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(namespace))) {
    throw new TypeError("Rightsizing namespace is invalid");
  }
  return [...new Set(normalized)].sort();
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized !== value) throw new TypeError(`${label} is invalid`);
  return normalized;
}
