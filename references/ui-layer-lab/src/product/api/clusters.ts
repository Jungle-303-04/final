import { apiRequest, type ApiPath } from "./client";
import { clusterListSchema, type ClusterList } from "./cluster-schemas";
import { withQuery } from "./url";

const DEFAULT_CLUSTER_LIMIT = 100;

export interface ListClustersOptions {
  limit?: number;
}

/**
 * Lists the session-visible clusters used by the Home cluster selector.
 * Backend source of truth: `src/domains/target/router.py::list_clusters`.
 */
export function listClusters(
  options: ListClustersOptions = {},
  signal?: AbortSignal,
): Promise<ClusterList> {
  const path = withQuery("/api/clusters" satisfies ApiPath, [
    ["limit", options.limit ?? DEFAULT_CLUSTER_LIMIT],
  ]);
  return apiRequest(path, clusterListSchema, { signal });
}
