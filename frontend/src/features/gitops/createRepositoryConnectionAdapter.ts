import type { GitOpsEndpointDependencies } from "./gitOpsEndpointContract";
import {
  GitOpsPortFailure,
  type GitOpsFailureCode,
} from "./gitOpsContract";
import type { RepositoryConnectionPort } from "./repositoryConnectionContract";

type RepositoryDiscoveryPort = Pick<
  RepositoryConnectionPort,
  | "probeRepository"
  | "listRepositoryBranches"
  | "listRepositoryManifests"
  | "validateRepositoryManifest"
  | "getRepositoryConnectionStatus"
>;

export function createRepositoryConnectionAdapter(
  endpoints: GitOpsEndpointDependencies,
): RepositoryDiscoveryPort {
  return {
    async probeRepository(repoRef, signal) {
      return withPortFailure(async () => {
        const response = await endpoints.probeRepository(repoRef, signal);
        return {
          repoRef: response.repo_ref,
          normalizedRepoRef: response.normalized_repo_ref,
          valid: response.valid,
          reachable: response.reachable,
          defaultBranch: response.default_branch,
          private: response.private,
          htmlUrl: response.html_url,
          warnings: response.warnings,
          errors: response.errors,
        };
      });
    },
    async listRepositoryBranches(repoRef, signal) {
      return withPortFailure(async () => {
        const response = await endpoints.listRepositoryBranches(repoRef, signal);
        return {
          repoRef: response.repo_ref,
          defaultBranch: response.default_branch,
          branches: response.branches,
          warnings: response.warnings,
        };
      });
    },
    async listRepositoryManifests(repoRef, branch, signal) {
      return withPortFailure(async () => {
        const response = await endpoints.listRepositoryManifests(repoRef, branch, signal);
        return {
          repoRef: response.repo_ref,
          branch: response.branch,
          candidates: response.candidates.map((candidate) => ({
            path: candidate.path,
            sourceType: candidate.source_type,
            displayName: candidate.display_name,
            reason: candidate.reason,
          })),
          warnings: response.warnings,
        };
      });
    },
    async validateRepositoryManifest(input, signal) {
      return withPortFailure(async () => {
        const response = await endpoints.validateRepositoryManifest(input, signal);
        return {
          repoRef: response.repo_ref,
          branch: response.branch,
          manifestPath: response.manifest_path,
          sourceType: input.sourceType,
          valid: response.valid,
          status: response.status,
          validationMode: response.validation_mode,
          resourceCount: response.resource_count,
          warnings: response.warnings,
          errors: response.errors,
        };
      });
    },
    async getRepositoryConnectionStatus(repoRef, signal) {
      return withPortFailure(async () => {
        const response = await endpoints.getRepositoryConnectionStatus(repoRef, signal);
        return {
          repoRef: response.repo_ref,
          repositoryId: response.repository_id,
          repositoryStatus: response.repository_status,
          connectionStage: response.connection_stage,
          terminal: response.terminal,
          refreshAfterSeconds: response.refresh_after_seconds,
        };
      });
    },
  };
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof GitOpsPortFailure ||
      (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
    ) {
      throw error;
    }
    const codeByKind: Record<string, GitOpsFailureCode> = {
      unauthorized: "unauthorized",
      forbidden: "forbidden",
      network: "offline",
      "invalid-payload": "invalid-response",
      "not-found": "not-found",
      "rate-limited": "rate-limited",
    };
    const kind = typeof error === "object" && error !== null && "kind" in error &&
      typeof error.kind === "string" ? error.kind : "";
    throw new GitOpsPortFailure(codeByKind[kind] ?? "error");
  }
}
