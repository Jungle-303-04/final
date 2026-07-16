import { apiRequest, type ApiPath } from "./client";
import {
  workloadRollbackPreviewSchema,
  type WorkloadRollbackPreviewEndpoint,
} from "./workload-rollbacks-schemas";

export function getWorkloadRollbackPreview(
  actionPath: string,
  signal?: AbortSignal,
): Promise<WorkloadRollbackPreviewEndpoint> {
  return apiRequest(toApiPath(canonicalActionPath(actionPath)), workloadRollbackPreviewSchema, {
    method: "GET",
    signal,
  });
}

function canonicalActionPath(path: string): string {
  const normalized = path.trim().replace(/\/+$/u, "");
  if (!/^\/(?!\/)[^?\s]+$/u.test(normalized)) {
    throw new TypeError("workload rollback capability path must be a local API path");
  }
  return normalized;
}

function toApiPath(path: string): ApiPath {
  return `/api${path}` as ApiPath;
}
