import { apiRequest, type ApiPath } from "./client";
import {
  kubernetesApiResourcesSchema,
  type KubernetesApiResourcesEndpoint,
} from "./api-resource-discovery-schemas";
import { encodePathSegment } from "./url";

export function getKubernetesApiResources(
  clusterId: string,
  signal?: AbortSignal,
): Promise<KubernetesApiResourcesEndpoint> {
  const path = `/api/clusters/${encodePathSegment(clusterId)}/api-resources` as ApiPath;
  return apiRequest(path, kubernetesApiResourcesSchema, { signal });
}
