import { apiRequest, type ApiPath } from "./client";
import {
  repositoryBranchListSchema,
  repositoryConnectionStatusSchema,
  repositoryManifestCatalogSchema,
  repositoryManifestValidationSchema,
  repositoryProbeSchema,
  type RepositoryBranchListEndpoint,
  type RepositoryConnectionStatusEndpoint,
  type RepositoryManifestCatalogEndpoint,
  type RepositoryManifestValidationEndpoint,
  type RepositoryProbeEndpoint,
} from "./repository-discovery-schemas";
import { withQuery } from "./url";

export function probeRepository(
  repoRef: string,
  signal?: AbortSignal,
): Promise<RepositoryProbeEndpoint> {
  return apiRequest("/api/repositories/discovery/probe", repositoryProbeSchema, jsonRequest({
    repo_ref: repoRef,
  }, signal));
}

export function listRepositoryBranches(
  repoRef: string,
  signal?: AbortSignal,
): Promise<RepositoryBranchListEndpoint> {
  const path = withQuery("/api/repositories/discovery/branches" as ApiPath, [
    ["repo_ref", repoRef],
  ]);
  return apiRequest(path, repositoryBranchListSchema, { signal });
}

export function listRepositoryManifests(
  repoRef: string,
  branch: string,
  signal?: AbortSignal,
): Promise<RepositoryManifestCatalogEndpoint> {
  return apiRequest(
    "/api/repositories/discovery/manifests",
    repositoryManifestCatalogSchema,
    jsonRequest({ repo_ref: repoRef, branch }, signal),
  );
}

export function validateRepositoryManifest(
  input: {
    repoRef: string;
    branch: string;
    manifestPath: string;
    sourceType: string;
  },
  signal?: AbortSignal,
): Promise<RepositoryManifestValidationEndpoint> {
  return apiRequest("/api/repositories/discovery/validate", repositoryManifestValidationSchema, jsonRequest({
    repo_ref: input.repoRef,
    branch: input.branch,
    manifest_path: input.manifestPath,
    source_type: input.sourceType,
  }, signal));
}

export function getRepositoryConnectionStatus(
  repoRef: string,
  signal?: AbortSignal,
): Promise<RepositoryConnectionStatusEndpoint> {
  const path = withQuery("/api/repositories/connection-status" as ApiPath, [
    ["repo_ref", repoRef],
  ]);
  return apiRequest(path, repositoryConnectionStatusSchema, { signal });
}

function jsonRequest(body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  };
}
