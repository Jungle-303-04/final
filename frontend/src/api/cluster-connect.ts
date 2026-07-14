import { apiRequest, type ApiPath } from "./client";
import {
  clusterConnectResponseSchema,
  clusterConnectStatusResponseSchema,
  type ClusterConnectProvider,
  type ClusterConnectResponse,
  type ClusterConnectStatusResponse,
} from "./cluster-connect-schemas";
import { encodePathSegment } from "./url";

export function connectCluster(
  input: { name: string; provider: ClusterConnectProvider },
  signal?: AbortSignal,
): Promise<ClusterConnectResponse> {
  return apiRequest("/api/clusters/connect" as ApiPath, clusterConnectResponseSchema, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  });
}

export function getClusterConnectStatus(
  clusterId: string,
  signal?: AbortSignal,
): Promise<ClusterConnectStatusResponse> {
  const path = `/api/clusters/${encodePathSegment(clusterId)}/connection` as ApiPath;
  return apiRequest(path, clusterConnectStatusResponseSchema, { signal });
}
