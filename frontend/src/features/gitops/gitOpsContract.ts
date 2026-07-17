export type ReleasePlanStatus = "draft" | "active" | "paused" | "archived";
export type GitOpsFailureCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-response"
  | "offline"
  | "not-found"
  | "rate-limited"
  | "error";

export class GitOpsPortFailure extends Error {
  readonly code: GitOpsFailureCode;
  readonly retryAfter: number | null;

  constructor(code: GitOpsFailureCode, retryAfter: number | null = null) {
    super(code);
    this.name = "GitOpsPortFailure";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export interface ReleaseApplication {
  id: string;
  name: string;
  repository: string;
  branch: string;
  clusterId: string;
  manifestPath: string;
}

export interface ReleaseCluster {
  id: string;
  name: string;
  environment: string;
  connectionStatus: string;
}

export interface GitOpsSyncTarget {
  id: string;
  applicationId: string;
  applicationName: string;
  clusterId: string | null;
  namespace: string | null;
  environment: string | null;
  syncStatus: string | null;
  revision: string | null;
  observedAt: string | null;
}

export type GitOpsAvailability = "available" | "partial" | "unavailable";
export type GitOpsAuthorization = "allowed" | "denied";
export type GitOpsReasonCode =
  | "binding_scope_unavailable"
  | "multiple_target_scopes"
  | "live_observation_not_integrated"
  | "source_revision_unavailable"
  | "workflow_operation_unobserved"
  | "provider_operation_not_integrated"
  | "not_authorized"
  | "operation_in_progress"
  | "provider_refresh_not_integrated"
  | "provider_sync_not_integrated";

export interface GitOpsResourceRef {
  apiGroup: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface GitOpsClusterScope {
  workspaceId: string;
  clusterId: string;
  namespaces: string[];
  freshness: "live" | "stale" | "partial" | "disconnected";
}

export interface GitOpsApplicationScope {
  availability: GitOpsAvailability;
  scope: GitOpsClusterScope | null;
  reasonCode: GitOpsReasonCode | null;
}

export interface GitOpsSource {
  repositoryRef: string | null;
  defaultBranch: string | null;
  manifestPath: string | null;
}

export interface GitOpsDesiredLiveDiffAvailability {
  availability: GitOpsAvailability;
  sourceRevision: string | null;
  liveObservationRevision: string | null;
  reasonCode: GitOpsReasonCode | null;
}

export interface GitOpsOperationObservation {
  availability: GitOpsAvailability;
  inProgress: boolean | null;
  workflowRunId: string | null;
  status: string | null;
  observedAt: string | null;
  reasonCode: GitOpsReasonCode | null;
}

export interface GitOpsActionCapability {
  action: "refresh" | "sync";
  authorization: GitOpsAuthorization;
  availability: GitOpsAvailability;
  /** This read-only detail projection has no auditable action executor yet. */
  enabled: false;
  operationBlocked: boolean;
  reasonCode: GitOpsReasonCode | null;
}

export interface GitOpsApplicationDetail {
  applicationId: string;
  name: string;
  resource: GitOpsResourceRef;
  scope: GitOpsApplicationScope;
  source: GitOpsSource;
  desiredLiveDiff: GitOpsDesiredLiveDiffAvailability;
  operation: GitOpsOperationObservation;
  capabilities: [GitOpsActionCapability, GitOpsActionCapability];
}

export type GitOpsResourceAction =
  | "reconcile"
  | "sync_with_source"
  | "suspend"
  | "resume"
  | "sync"
  | "refresh";

export interface GitOpsResourceLocator {
  clusterId: string;
  apiVersion: string;
  kind: string;
  namespace: string;
  name: string;
}

export interface GitOpsTreeNode {
  id: string;
  resource: GitOpsResourceRef;
  role: "root" | "declared" | "generated" | "source" | "dependency";
  status: string | null;
  health: string | null;
}

export interface GitOpsResourceTree {
  scope: GitOpsClusterScope;
  root: GitOpsResourceRef;
  nodes: GitOpsTreeNode[];
  edges: {
    source: string;
    target: string;
    relationship: "owns" | "source" | "depends_on";
  }[];
  coverage: {
    state: "complete" | "partial";
    reasonCodes: string[];
    observedCount: number;
    returnedCount: number;
  };
}

export interface GitOpsResourceInsights {
  scope: GitOpsClusterScope;
  resource: GitOpsResourceRef;
  resourceVersion: string;
  provider: "argo" | "flux";
  status: string | null;
  health: string | null;
  revision: string | null;
  source: GitOpsResourceRef | null;
  conditions: {
    type: string;
    status: string;
    reason: string | null;
    message: string | null;
    observedAt: string | null;
  }[];
  history: {
    id: string | null;
    revision: string | null;
    deployedAt: string | null;
    phase: string | null;
    message: string | null;
    initiatedBy: string | null;
  }[];
  capabilities: {
    scope: GitOpsClusterScope;
    resource: GitOpsResourceRef;
    revision: string;
    actions: GitOpsResourceAction[];
  };
}

export interface GitOpsSyncOptions {
  revision?: string;
  prune: boolean;
  dryRun: boolean;
  force: boolean;
  applyOnly: boolean;
  syncOptions: string[];
  resources: {
    apiGroup: string;
    kind: string;
    namespace: string | null;
    name: string;
  }[];
}

export interface GitOpsResourceActionInput {
  action: GitOpsResourceAction;
  reason: string;
  confirmation: true;
  refreshMode?: "normal" | "hard";
  options?: GitOpsSyncOptions;
  idempotencyKey: string;
  insights: GitOpsResourceInsights;
}

export interface ReleaseTargetInput {
  name: string;
  repository: string;
  branch: string;
  manifestPath: string;
  clusterId: string;
  namespace: string;
  environment: string;
  token?: string;
}

export interface ReleasePlanStep {
  step_id?: string;
  application_id: string;
  name: string;
  position: number;
  depends_on: string[];
  config: Record<string, unknown>;
}

export interface ReleasePlan {
  plan_id?: string;
  name: string;
  description: string;
  status: ReleasePlanStatus;
  settings: Record<string, unknown>;
  steps: ReleasePlanStep[];
  updated_at?: string;
}

export interface ReleasePreview {
  plan_id?: string;
  executable: boolean;
  summary: string;
  waves: { wave: number; step_ids: string[]; applications: string[] }[];
  steps: {
    step_id: string;
    application_id: string;
    name: string;
    position: number;
    wave: number | null;
    blocked_by: string[];
    gate: string;
    strategy: string;
    environment: string;
    action: string;
  }[];
  blockers: string[];
}

export interface ReleaseReadiness {
  ready: boolean;
  mode: string;
  summary: string;
  checks: {
    check_id: string;
    name: string;
    status: string;
    message: string;
    blockers: string[];
  }[];
  impact?: {
    summary: string;
    runtime_mode: string;
    live_side_effects: boolean;
    total_steps: number;
    total_waves: number;
    first_wave: number;
    applications: string[];
    environments: string[];
    production_targets: string[];
    production_target_count: number;
    first_wave_steps: Record<string, unknown>[];
  };
  next_actions: {
    action_id: string;
    check_id: string;
    label: string;
    severity: string;
    message: string;
    blockers: string[];
  }[];
  blockers: string[];
  warnings: string[];
}

export interface ReleaseRunStep {
  run_step_id: string;
  application_id: string;
  name: string;
  wave: number;
  status: string;
  workflow_run_id?: string;
  event_id?: string;
  correlation_id?: string;
  approval_id?: string | null;
  health: Record<string, unknown>;
  rollback: Record<string, unknown>;
  details: Record<string, unknown>;
  workflow?: Record<string, unknown>;
}

export interface ReleaseRun {
  run_id: string;
  plan_id: string;
  plan_name: string;
  status: string;
  derived_status?: string;
  current_wave: number;
  total_waves: number;
  started_by?: string;
  settings: Record<string, unknown>;
  github: Record<string, unknown>;
  rollback: Record<string, unknown>;
  health: Record<string, unknown>;
  attention?: Record<string, unknown>;
  steps: ReleaseRunStep[];
  events: {
    audit_id: string;
    event_type: string;
    message: string;
    actor?: string;
    details: Record<string, unknown>;
    created_at?: string;
  }[];
  created_at?: string;
  updated_at?: string;
}

export interface GeneratedManifest {
  manifest: string;
  files: { path: string; content: string; action: string; description: string }[];
  resources: { api_version: string; kind: string; namespace: string; name: string }[];
  resource_count: number;
  diagnostics: {
    source: string;
    severity: string;
    message: string;
    code: string;
    line: number;
    column: number;
    end_line: number;
    end_column: number;
    path?: string;
    action?: string | null;
  }[];
  warnings: string[];
  summary: string;
}

export interface SafePrResult extends GeneratedManifest {
  accepted: boolean;
  event_id: string;
  correlation_id: string;
  workflow_run_id: string;
  application_id: string;
  repo_ref: string;
  base_branch: string;
  manifest_path: string;
  commit_sha: string;
  patch_sha256: string;
}

export type ReleaseRunAction =
  | "advance"
  | "pause"
  | "resume"
  | "retry"
  | "rollback"
  | "cancel"
  | "notify";

export interface GitOpsPort {
  listApplications(signal?: AbortSignal): Promise<ReleaseApplication[]>;
  listSyncTargets(signal?: AbortSignal): Promise<GitOpsSyncTarget[]>;
  getApplicationDetail(applicationId: string, signal?: AbortSignal): Promise<GitOpsApplicationDetail>;
  getResourceTree?(locator: GitOpsResourceLocator, signal?: AbortSignal): Promise<GitOpsResourceTree>;
  getResourceInsights?(locator: GitOpsResourceLocator, signal?: AbortSignal): Promise<GitOpsResourceInsights>;
  executeResourceAction?(locator: GitOpsResourceLocator, input: GitOpsResourceActionInput, signal?: AbortSignal): Promise<import("../../shared/parity/referenceParity").CommandReceipt>;
  listClusters(signal?: AbortSignal): Promise<ReleaseCluster[]>;
  listPlans(signal?: AbortSignal): Promise<ReleasePlan[]>;
  listRuns(planId?: string, signal?: AbortSignal): Promise<ReleaseRun[]>;
  connectApplication(input: ReleaseTargetInput, signal?: AbortSignal): Promise<ReleaseApplication>;
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
