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
  listPlans(signal?: AbortSignal): Promise<ReleasePlan[]>;
  listRuns(planId?: string, signal?: AbortSignal): Promise<ReleaseRun[]>;
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
