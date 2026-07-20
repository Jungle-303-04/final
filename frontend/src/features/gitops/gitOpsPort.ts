import type { RepositoryConnectionPort } from "./repositoryConnectionContract";
import type {
  ApprovalDecision,
  GitOpsApplicationDetail,
  GitOpsResourceActionInput,
  GitOpsResourceInsights,
  GitOpsResourceLocator,
  GitOpsResourceTree,
  GitOpsSyncTarget,
  GitOpsSyncTargetQuery,
  ReleaseApplication,
  ReleaseCluster,
} from "./gitOpsContract";
import type {
  GeneratedManifest,
  ReleasePlan,
  ReleasePreview,
  ReleaseReadiness,
  ReleaseRun,
  ReleaseRunAction,
  SafePrResult,
} from "./releasePlanContract";

export interface GitOpsPort extends RepositoryConnectionPort {
  listApplications(signal?: AbortSignal): Promise<ReleaseApplication[]>;
  listSyncTargets(signal?: AbortSignal, query?: GitOpsSyncTargetQuery): Promise<GitOpsSyncTarget[]>;
  getApplicationDetail(applicationId: string, signal?: AbortSignal): Promise<GitOpsApplicationDetail>;
  getResourceTree?(locator: GitOpsResourceLocator, signal?: AbortSignal): Promise<GitOpsResourceTree>;
  getResourceInsights?(locator: GitOpsResourceLocator, signal?: AbortSignal): Promise<GitOpsResourceInsights>;
  executeResourceAction?(locator: GitOpsResourceLocator, input: GitOpsResourceActionInput, signal?: AbortSignal): Promise<import("../../shared/parity/referenceParity").CommandReceipt>;
  listClusters(signal?: AbortSignal): Promise<ReleaseCluster[]>;
  listPlans(signal?: AbortSignal): Promise<ReleasePlan[]>;
  listRuns(planId?: string, signal?: AbortSignal): Promise<ReleaseRun[]>;
  savePlan(plan: ReleasePlan, signal?: AbortSignal): Promise<ReleasePlan>;
  previewPlan(plan: ReleasePlan, signal?: AbortSignal): Promise<ReleasePreview>;
  checkReadiness(plan: ReleasePlan, signal?: AbortSignal): Promise<ReleaseReadiness>;
  startPlan(plan: ReleasePlan, signal?: AbortSignal): Promise<ReleaseRun>;
  decideApproval(
    approvalId: string,
    decision: ApprovalDecision,
    reason?: string,
    signal?: AbortSignal,
  ): Promise<void>;
  renderManifest(plan: ReleasePlan, stepIndex: number, signal?: AbortSignal): Promise<GeneratedManifest>;
  submitSafePr(plan: ReleasePlan, stepIndex: number, signal?: AbortSignal): Promise<SafePrResult>;
  runAction(
    runId: string,
    action: ReleaseRunAction,
    reason?: string,
    signal?: AbortSignal,
  ): Promise<ReleaseRun>;
}
