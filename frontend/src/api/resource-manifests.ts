import { apiRequest, type ApiPath } from "./client";
import {
  resourceManifestApproveSchema,
  resourceManifestApplySchema,
  resourceManifestPreviewSchema,
  resourceManifestSourceSchema,
  type ResourceManifestApproveEndpoint,
  type ResourceManifestApplyEndpoint,
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

export interface ResourceManifestDirectApplyInput extends ResourceManifestEditInput {
  expectedDesiredSha256: string;
  confirmation: true;
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

export function applyResourceManifestNow(
  resourceId: string,
  input: ResourceManifestDirectApplyInput,
  signal?: AbortSignal,
): Promise<ResourceManifestApplyEndpoint> {
  return apiRequest(resourceManifestPath(resourceId, "apply"), resourceManifestApplySchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": manifestApplyIdempotencyKey(resourceId, input),
    },
    body: JSON.stringify({
      ...requestBody(input),
      expected_desired_sha256: input.expectedDesiredSha256,
      confirmation: input.confirmation,
      reason: input.reason,
    }),
    signal,
  });
}

function resourceManifestPath(resourceId: string, action: "preview" | "approve" | "apply"): ApiPath {
  return `/api/resource-manifests/${encodePathSegment(resourceId)}/${action}` as ApiPath;
}

function manifestApplyIdempotencyKey(
  resourceId: string,
  input: ResourceManifestDirectApplyInput,
): string {
  const key = [resourceId, input.applicationId, input.baseSha, input.expectedDesiredSha256]
    .join(":")
    .replace(/[^A-Za-z0-9._:-]/gu, "_");
  return `manifest:${simpleHash(key)}:${input.expectedDesiredSha256.replace("sha256:", "").slice(0, 32)}`;
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function requestBody(input: ResourceManifestEditInput) {
  return {
    application_id: input.applicationId,
    base_sha: input.baseSha,
    source_sha256: input.sourceSha256,
    edited_yaml: input.editedYaml,
  };
}
