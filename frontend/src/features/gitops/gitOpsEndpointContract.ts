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

export interface ReleaseClusterEndpoint {
  cluster_id: string;
  name: string;
  environment: string;
  connection_status: string;
}

export interface GitOpsEndpointDependencies {
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
