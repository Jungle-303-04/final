import { z } from "zod";

import { apiRequest, type ApiPath } from "./client";
import { clusterListSchema, type ClusterList } from "./cluster-schemas";
import { encodePathSegment, withQuery } from "./url";

const DEFAULT_CLUSTER_LIMIT = 100;

export interface ListClustersOptions {
  limit?: number;
}

export interface UnregisterClusterOptions {
  manualCleanupAttested?: boolean;
}

const clusterUnregisterResponseSchema = z.strictObject({
  cluster_id: z.string().min(1),
  status: z.enum(["uninstalling", "cleanup_required", "disconnected", "purged"]),
  stage: z.string().min(1),
  command_id: z.string().min(1).nullable(),
  command_status_path: z.string().min(1).nullable(),
  uninstall_command: z.string().min(1).nullable(),
  cleanup_verified: z.boolean(),
  resources: z.array(z.string()),
  residual_resources: z.array(z.string()),
  failure_reason: z.string().nullable(),
});

export type ClusterUnregisterResponse = z.output<typeof clusterUnregisterResponseSchema>;

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

/**
 * Stops an installed target agent without ever exposing physical fixture purge.
 * Manual cleanup is an explicit operator attestation, never an inferred retry.
 */
export function unregisterCluster(
  clusterId: string,
  options: UnregisterClusterOptions = {},
  signal?: AbortSignal,
): Promise<ClusterUnregisterResponse> {
  const normalized = clusterId.trim();
  if (!normalized) throw new TypeError("clusterId must not be empty");
  const path = withQuery(
    `/api/clusters/${encodePathSegment(normalized)}` as ApiPath,
    [
      ["purge", false],
      ["manual_cleanup_attested", options.manualCleanupAttested ? true : null],
    ],
  );
  return apiRequest(path, clusterUnregisterResponseSchema, { method: "DELETE", signal });
}
