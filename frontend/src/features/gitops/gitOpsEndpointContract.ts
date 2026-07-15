import type {
  GeneratedManifest,
  ReleasePlan,
  ReleasePreview,
  ReleaseReadiness,
  ReleaseRun,
  ReleaseRunAction,
  ReleaseTargetInput,
  SafePrResult,
} from "./gitOpsContract";

export interface GitOpsApplicationDetailEndpoint {
  application: {
    application_id: string;
    name: string;
    resource: {
      api_group: string;
      version: string;
      kind: string;
      namespace: string | null;
      name: string;
      uid: string;
    };
    scope: {
      availability: "available" | "partial" | "unavailable";
      scope: {
        workspace_id: string;
        cluster_id: string;
        namespaces: string[];
        freshness: "live" | "stale" | "partial" | "disconnected";
      } | null;
      reason_code: string | null;
    };
    source: {
      repository_ref: string | null;
      default_branch: string | null;
      manifest_path: string | null;
    };
    desired_live_diff: {
      availability: "available" | "partial" | "unavailable";
      source_revision: string | null;
      live_observation_revision: string | null;
      reason_code: string | null;
    };
    operation: {
      availability: "available" | "partial" | "unavailable";
      in_progress: boolean | null;
      workflow_run_id: string | null;
      status: string | null;
      observed_at: string | null;
      reason_code: string | null;
    };
    capabilities: [{
      action: "refresh" | "sync";
      authorization: "allowed" | "denied";
      availability: "available" | "partial" | "unavailable";
      enabled: boolean;
      operation_blocked: boolean;
      reason_code: string | null;
    }, {
      action: "refresh" | "sync";
      authorization: "allowed" | "denied";
      availability: "available" | "partial" | "unavailable";
      enabled: boolean;
      operation_blocked: boolean;
      reason_code: string | null;
    }];
  };
}

export interface ReleaseClusterEndpoint {
  cluster_id: string;
  name: string;
  environment: string;
  connection_status: string;
}

export interface GitOpsEndpointDependencies {
  getApplicationDetail(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<GitOpsApplicationDetailEndpoint>;
  listApplications(signal?: AbortSignal): Promise<{
    applications: Record<string, unknown>[];
  }>;
  listApplicationDeployments(
    applicationId: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ deployments: Record<string, unknown>[] }>;
  listClusters(signal?: AbortSignal): Promise<{ clusters: ReleaseClusterEndpoint[] }>;
  listPlans(signal?: AbortSignal): Promise<{ plans: ReleasePlan[] }>;
  listRuns(planId?: string, signal?: AbortSignal): Promise<{ runs: ReleaseRun[] }>;
  connectApplication(
    input: ReleaseTargetInput,
    signal?: AbortSignal,
  ): Promise<{ application: Record<string, unknown> }>;
  savePlan(plan: ReleasePlan, signal?: AbortSignal): Promise<ReleasePlan>;
  previewPlan(plan: ReleasePlan, signal?: AbortSignal): Promise<ReleasePreview>;
  checkReadiness(plan: ReleasePlan, signal?: AbortSignal): Promise<ReleaseReadiness>;
  startPlan(plan: ReleasePlan, signal?: AbortSignal): Promise<ReleaseRun>;
  renderManifest(plan: ReleasePlan, stepIndex: number, signal?: AbortSignal): Promise<GeneratedManifest>;
  submitSafePr(plan: ReleasePlan, stepIndex: number, signal?: AbortSignal): Promise<SafePrResult>;
  runAction(
    runId: string,
    action: ReleaseRunAction,
    reason?: string,
    signal?: AbortSignal,
  ): Promise<ReleaseRun>;
}
