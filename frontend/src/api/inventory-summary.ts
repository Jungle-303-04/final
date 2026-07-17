import { apiRequest, type ApiPath } from "./client";
import {
  inventorySummarySchema,
  type InventorySummary,
} from "./inventory-summary-schemas";
import { canonicalKubernetesNamespaces } from "../shared/data/kubernetesNamespace";
import { encodePathSegment, withQuery } from "./url";

const MAX_INVENTORY_COUNT_NAMESPACES = 32;

/** Loads the latest inventory snapshot and resource counts for a cluster. */
export function getInventorySummary(
  clusterId: string,
  namespaces: readonly string[] = [],
  signal?: AbortSignal,
): Promise<InventorySummary> {
  const base =
    `/api/clusters/${encodePathSegment(clusterId)}/inventory/summary` as ApiPath;
  const namespaceScope = canonicalKubernetesNamespaces(
    namespaces,
    MAX_INVENTORY_COUNT_NAMESPACES,
  );
  const path = withQuery(base, [[
    "namespaces",
    namespaceScope.length > 0 ? namespaceScope.join(",") : undefined,
  ]]);
  return apiRequest(path, inventorySummarySchema, { signal });
}
