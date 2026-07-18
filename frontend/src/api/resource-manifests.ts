import { apiRequest, type ApiPath } from "./client";
import {
  resourceManifestApproveSchema,
  resourceManifestApplySchema,
  resourceManifestCreateCapabilitySchema,
  resourceManifestDeploySchema,
  resourceManifestPreviewSchema,
  resourceManifestSourceSchema,
  type ResourceManifestApproveEndpoint,
  type ResourceManifestApplyEndpoint,
  type ResourceManifestCreateCapabilityEndpoint,
  type ResourceManifestDeployEndpoint,
  type ResourceManifestPreviewEndpoint,
  type ResourceManifestSourceEndpoint,
} from "./resource-manifests-schemas";
import { encodePathSegment, withQuery } from "./url";

export interface ResourceManifestEditInput {
  applicationId: string | null;
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

export interface ResourceManifestDeployInput extends ResourceManifestEditInput {
  confirmation: true;
  reason: string;
}

export interface ResourceManifestCreateDryRunInput {
  clusterId: string;
  namespace: string;
  snapshotId: string;
  editedYaml: string;
  force: boolean;
  reason: string;
}

export interface ResourceManifestCreateInput extends ResourceManifestCreateDryRunInput {
  desiredSha256: string;
  dryRunCommandId: string;
  confirmation: true;
  forceConfirmation: boolean;
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

export function deployResourceManifestEdit(
  resourceId: string,
  input: ResourceManifestDeployInput,
  signal?: AbortSignal,
): Promise<ResourceManifestDeployEndpoint> {
  return apiRequest(resourceManifestPath(resourceId, "deploy"), resourceManifestDeploySchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": manifestDeployIdempotencyKey(resourceId, input),
    },
    body: JSON.stringify({
      ...requestBody(input),
      confirmation: input.confirmation,
      reason: input.reason,
    }),
    signal,
  });
}

export function getResourceManifestCreateCapability(
  clusterId: string,
  namespace: string,
  signal?: AbortSignal,
): Promise<ResourceManifestCreateCapabilityEndpoint> {
  const path = withQuery("/api/resource-manifests/create/capability" as ApiPath, [
    ["cluster_id", clusterId],
    ["namespace", namespace],
  ]);
  return apiRequest(path, resourceManifestCreateCapabilitySchema, { signal });
}

export function dryRunResourceManifestCreate(
  input: ResourceManifestCreateDryRunInput,
  signal?: AbortSignal,
): Promise<ResourceManifestApplyEndpoint> {
  return apiRequest("/api/resource-manifests/create/dry-run" as ApiPath, resourceManifestApplySchema, {
    method: "POST",
    headers: createHeaders("dry-run", input),
    body: JSON.stringify(createRequestBody(input)),
    signal,
  });
}

export function createResourceManifest(
  input: ResourceManifestCreateInput,
  signal?: AbortSignal,
): Promise<ResourceManifestApplyEndpoint> {
  return apiRequest("/api/resource-manifests/create" as ApiPath, resourceManifestApplySchema, {
    method: "POST",
    headers: createHeaders("apply", input),
    body: JSON.stringify({
      ...createRequestBody(input),
      desired_sha256: input.desiredSha256,
      dry_run_command_id: input.dryRunCommandId,
      confirmation: input.confirmation,
      force_confirmation: input.forceConfirmation,
    }),
    signal,
  });
}

function resourceManifestPath(resourceId: string, action: "preview" | "approve" | "apply" | "deploy"): ApiPath {
  return `/api/resource-manifests/${encodePathSegment(resourceId)}/${action}` as ApiPath;
}

function manifestDeployIdempotencyKey(
  resourceId: string,
  input: ResourceManifestDeployInput,
): string {
  const key = [resourceId, input.applicationId, input.baseSha, input.sourceSha256, input.editedYaml]
    .join(":");
  return `manifest-deploy:${simpleHash(key)}:${input.sourceSha256.replace("sha256:", "").slice(0, 32)}`;
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

function createHeaders(
  mode: "dry-run" | "apply",
  input: ResourceManifestCreateDryRunInput,
): Record<string, string> {
  const fingerprint = [
    mode,
    input.clusterId,
    input.namespace,
    input.snapshotId,
    String(input.force),
    input.reason,
    input.editedYaml,
  ].join("\u0000");
  return {
    "content-type": "application/json",
    "Idempotency-Key": `manifest-create:${mode}:${simpleHash(fingerprint)}`,
  };
}

function createRequestBody(input: ResourceManifestCreateDryRunInput) {
  return {
    cluster_id: input.clusterId,
    namespace: input.namespace,
    snapshot_id: input.snapshotId,
    edited_yaml: input.editedYaml,
    force: input.force,
    reason: input.reason,
  };
}

function requestBody(input: ResourceManifestEditInput) {
  return {
    application_id: input.applicationId,
    base_sha: input.baseSha,
    source_sha256: input.sourceSha256,
    edited_yaml: input.editedYaml,
  };
}
