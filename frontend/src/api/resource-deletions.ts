import { apiRequest, type ApiPath } from "./client";
import {
  resourceDeletionPreviewSchema,
  type ResourceDeletionPreviewEndpoint,
} from "./resource-deletions-schemas";

export function getResourceDeletionPreview(
  actionPath: string,
  signal?: AbortSignal,
): Promise<ResourceDeletionPreviewEndpoint> {
  const path = toApiPath(`${canonicalActionPath(actionPath)}/cascade-preview`);
  return apiRequest(path, resourceDeletionPreviewSchema, { method: "GET", signal });
}

function canonicalActionPath(path: string): string {
  const normalized = path.trim().replace(/\/+$/u, "");
  if (!/^\/(?!\/)[^?\s]+$/u.test(normalized)) {
    throw new TypeError("resource deletion capability path must be a local API path");
  }
  return normalized;
}

function toApiPath(path: string): ApiPath {
  return `/api${path}` as ApiPath;
}
