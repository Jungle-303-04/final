export type ApplicationsGitOpsFailureCode =
  | "forbidden"
  | "invalid-response"
  | "offline"
  | "unavailable"
  | "unknown";

export class ApplicationsGitOpsFailure extends Error {
  readonly code: ApplicationsGitOpsFailureCode;

  constructor(code: ApplicationsGitOpsFailureCode) {
    super(`Applications/GitOps request failed: ${code}`);
    this.name = "ApplicationsGitOpsFailure";
    this.code = code;
  }
}

export interface ApplicationSummary {
  id: string;
  name: string;
  repositoryId: string | null;
  repositoryRef: string | null;
  branch: string | null;
  manifestPath: string | null;
  status: string | null;
}

export interface ApplicationCatalog {
  applications: readonly ApplicationSummary[];
}

export interface DeploymentTarget {
  id: string;
  clusterId: string | null;
  namespace: string | null;
  environment: string | null;
  manifestPath: string | null;
  pollStatus: string | null;
  lastCommitSha: string | null;
  lastPolledAt: string | null;
}

export type PromotionGateState = "eligible" | "blocked" | "pending";

export interface WorkflowRunSummary {
  id: string;
  status: string | null;
  currentStep: string | null;
  revision: string | null;
  updatedAt: string | null;
  promotionGate: PromotionGateState;
  failedResourceCount: number | null;
}

export interface GitOpsSnapshot {
  deployments: readonly DeploymentTarget[];
  runs: readonly WorkflowRunSummary[];
}

export interface ApplicationsGitOpsPort {
  listApplications(signal?: AbortSignal): Promise<ApplicationCatalog>;
  loadGitOpsSnapshot(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<GitOpsSnapshot>;
}

export type JsonMap = Record<string, unknown>;

export interface ApplicationsGitOpsApiDependencies {
  listApplications(options?: { signal?: AbortSignal }): Promise<{
    applications: JsonMap[];
  }>;
  listApplicationDeployments(
    applicationId: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ deployments: JsonMap[] }>;
  listApplicationRuns(
    applicationId: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ runs: JsonMap[] }>;
}
