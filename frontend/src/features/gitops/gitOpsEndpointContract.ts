import type {
  GeneratedManifest,
  ReleasePlan,
  ReleasePreview,
  ReleaseReadiness,
  ReleaseRun,
  ReleaseRunAction,
  SafePrResult,
} from "./gitOpsContract";

export interface GitOpsEndpointDependencies {
  listApplications(signal?: AbortSignal): Promise<{
    applications: Record<string, unknown>[];
  }>;
  listPlans(signal?: AbortSignal): Promise<{ plans: ReleasePlan[] }>;
  listRuns(planId?: string, signal?: AbortSignal): Promise<{ runs: ReleaseRun[] }>;
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
