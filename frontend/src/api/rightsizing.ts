import { apiRequest } from "./client";
import { rightsizingScanSchema, type RightsizingScanEndpoint } from "./rightsizing-schemas";
import { withQuery } from "./url";
import { canonicalKubernetesNamespaces } from "../shared/data/kubernetesNamespace";

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
  return canonicalKubernetesNamespaces(namespaces, 100);
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized !== value) throw new TypeError(`${label} is invalid`);
  return normalized;
}
