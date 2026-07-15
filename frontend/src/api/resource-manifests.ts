import { apiRequest, type ApiPath } from "./client";
import {
  resourceManifestApproveSchema,
  resourceManifestPreviewSchema,
  resourceManifestSourceSchema,
  type ResourceManifestApproveEndpoint,
  type ResourceManifestPreviewEndpoint,
  type ResourceManifestSourceEndpoint,
} from "./resource-manifests-schemas";
import { encodePathSegment, withQuery } from "./url";

export interface ResourceManifestEditInput {
  applicationId: string;
  baseSha: string;
  sourceSha256: string;
  editedYaml: string;
}

export interface ResourceManifestApprovalInput extends ResourceManifestEditInput {
  confirmed: true;
  reason: string;
}

export function getResourceManifestSource(
  resourceId: string,
  applicationId?: string | null,
  signal?: AbortSignal,
): Promise<ResourceManifestSourceEndpoint> {
  const base = `/api/resource-manifests/${encodePathSegment(resourceId)}` as ApiPath;
  const path = withQuery(base, [["application_id", applicationId ?? undefined]]);
  return apiRequest(path, resourceManifestSourceSchema, { signal });
}

export function previewResourceManifestEdit(
  resourceId: string,
  input: ResourceManifestEditInput,
  signal?: AbortSignal,
): Promise<ResourceManifestPreviewEndpoint> {
  return apiRequest(resourceManifestPath(resourceId, "preview"), resourceManifestPreviewSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody(input)),
    signal,
  });
}

export function approveResourceManifestEdit(
  resourceId: string,
  input: ResourceManifestApprovalInput,
  signal?: AbortSignal,
): Promise<ResourceManifestApproveEndpoint> {
  return apiRequest(resourceManifestPath(resourceId, "approve"), resourceManifestApproveSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...requestBody(input),
      confirmed: input.confirmed,
      reason: input.reason,
    }),
    signal,
  });
}

function resourceManifestPath(resourceId: string, action: "preview" | "approve"): ApiPath {
  return `/api/resource-manifests/${encodePathSegment(resourceId)}/${action}` as ApiPath;
}

function requestBody(input: ResourceManifestEditInput) {
  return {
    application_id: input.applicationId,
    base_sha: input.baseSha,
    source_sha256: input.sourceSha256,
    edited_yaml: input.editedYaml,
  };
}
