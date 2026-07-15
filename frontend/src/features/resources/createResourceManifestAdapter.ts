import type {
  ResourceManifestEndpointDependencies,
  ResourceManifestSourceEndpoint,
} from "./resourceManifestEndpointContract";
import {
  ResourceManifestPortFailure,
  type ResourceManifestPort,
  type ResourceManifestSourceChoice,
} from "./resourceManifestContract";

export function createResourceManifestAdapter(
  dependencies: ResourceManifestEndpointDependencies,
): ResourceManifestPort {
  return {
    async loadSource(resourceId, applicationId, signal) {
      return withFailure(async () => {
        const value = await dependencies.getResourceManifestSource(resourceId, applicationId, signal);
        return {
          resourceId: value.resource_id,
          status: value.status,
          choices: value.choices.map(choice),
          selected: value.selected ? choice(value.selected) : null,
          baseSha: value.base_sha,
          sourceSha256: value.source_sha256,
          content: value.content,
          reason: value.reason,
        };
      });
    },
    async preview(resourceId, input, signal) {
      return withFailure(async () => {
        const value = await dependencies.previewResourceManifestEdit(resourceId, input, signal);
        return {
          valid: value.valid,
          changed: value.changed,
          baseSha: value.base_sha,
          sourceSha256: value.source_sha256,
          desiredSha256: value.desired_sha256,
          diff: value.diff,
          errors: value.errors,
          warnings: value.warnings,
        };
      });
    },
    async approve(resourceId, input, signal) {
      return withFailure(async () => {
        const value = await dependencies.approveResourceManifestEdit(
          resourceId,
          { ...input, confirmed: true },
          signal,
        );
        return {
          correlationId: value.correlation_id,
          workflowRunId: value.workflow_run_id,
          approvalId: value.approval_id,
          syncState: "awaiting-pr-merge" as const,
        };
      });
    },
  };
}

function choice(value: ResourceManifestSourceEndpoint["choices"][number]): ResourceManifestSourceChoice {
  return {
    applicationId: value.application_id,
    applicationName: value.application_name,
    repositoryRef: value.repository_ref,
    branch: value.branch,
    manifestPath: value.manifest_path,
    environment: value.environment,
  };
}

async function withFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const kind = transportString(error, "kind");
    const status = transportNumber(error, "status");
    if (kind === "unauthorized" || status === 401) {
      throw new ResourceManifestPortFailure("unauthorized");
    }
    if (kind === "forbidden" || status === 403) {
      throw new ResourceManifestPortFailure("forbidden");
    }
    if (kind === "not-found" || status === 404) {
      throw new ResourceManifestPortFailure("not-found");
    }
    if (status === 409) throw new ResourceManifestPortFailure("stale");
    if (kind === "invalid-request" || status === 422) {
      throw new ResourceManifestPortFailure("invalid");
    }
    throw new ResourceManifestPortFailure("unavailable");
  }
}

function transportString(error: unknown, key: string): string | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function transportNumber(error: unknown, key: string): number | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
