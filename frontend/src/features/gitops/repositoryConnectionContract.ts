import type { ReleaseApplication, ReleaseTargetInput } from "./gitOpsContract";

export type RepositoryConnectionInput = Pick<
  ReleaseTargetInput,
  "name" | "repository" | "clusterId" | "namespace" | "environment"
>;

export type RepositoryConnectionStage =
  | "probe"
  | "branches"
  | "manifests"
  | "validate"
  | "connect"
  | "status";

export interface RepositoryProbe {
  repoRef: string;
  normalizedRepoRef: string;
  valid: boolean;
  reachable: boolean;
  defaultBranch: string | null;
  private: boolean | null;
  htmlUrl: string | null;
  warnings: string[];
  errors: string[];
}

export interface RepositoryBranchCatalog {
  repoRef: string;
  defaultBranch: string | null;
  branches: { name: string; protected: boolean; default: boolean }[];
  warnings: string[];
}

export interface RepositoryManifestCatalog {
  repoRef: string;
  branch: string;
  candidates: {
    path: string;
    sourceType: string;
    displayName: string;
    reason: string;
  }[];
  warnings: string[];
}

export interface RepositoryManifestSelection {
  repoRef: string;
  branch: string;
  manifestPath: string;
  sourceType: string;
}

export interface RepositoryManifestValidation extends RepositoryManifestSelection {
  valid: boolean;
  status: string;
  validationMode: string;
  resourceCount: number;
  warnings: string[];
  errors: string[];
}

export interface RepositoryConnectionStatus {
  repoRef: string;
  repositoryId: string | null;
  repositoryStatus:
    | "unregistered"
    | "active"
    | "invalid_credential"
    | "disabled"
    | "unknown";
  connectionStage: "awaiting_validation" | "ready" | "error";
  terminal: boolean;
  refreshAfterSeconds: number | null;
}

export interface RepositoryConnectionPort {
  probeRepository(repoRef: string, signal?: AbortSignal): Promise<RepositoryProbe>;
  listRepositoryBranches(repoRef: string, signal?: AbortSignal): Promise<RepositoryBranchCatalog>;
  listRepositoryManifests(
    repoRef: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<RepositoryManifestCatalog>;
  validateRepositoryManifest(
    input: RepositoryManifestSelection,
    signal?: AbortSignal,
  ): Promise<RepositoryManifestValidation>;
  getRepositoryConnectionStatus(
    repoRef: string,
    signal?: AbortSignal,
  ): Promise<RepositoryConnectionStatus>;
  connectApplication(
    input: ReleaseTargetInput,
    signal?: AbortSignal,
  ): Promise<ReleaseApplication>;
}
