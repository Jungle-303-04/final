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

export interface GitOpsSyncTargetQuery {
  clusters?: readonly string[];
  namespaces?: readonly string[];
  applications?: readonly string[];
  providers?: readonly ("argo" | "flux" | "internal")[];
  kinds?: readonly string[];
  labels?: Readonly<Record<string, string>>;
  q?: string;
  limit?: number;
}

export interface GitOpsSyncTarget {
  id: string;
  /** Every application identity carried by canonical overview adapters; legacy ports may omit it. */
  applicationIds?: readonly string[];
  applicationId: string;
  applicationName: string;
  clusterId: string | null;
  namespace: string | null;
  environment: string | null;
  syncStatus: string | null;
  revision: string | null;
  observedAt: string | null;
  authority?: "registered" | "controller";
  provider?: "internal" | "argo" | "flux";
  kind?: string | null;
  health?: string | null;
  resourceLocator?: GitOpsResourceLocator | null;
  freshness?: "live" | "stale" | "partial" | "disconnected";
  partialReasonCodes?: string[];
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

export type {
  GeneratedManifest,
  ReleasePlan,
  ReleasePlanStep,
  ReleasePreview,
  ReleaseReadiness,
  ReleaseRun,
  ReleaseRunAction,
  ReleaseRunStep,
  ReleaseTargetInput,
  SafePrResult,
} from "./releasePlanContract";
export type { GitOpsPort } from "./gitOpsPort";
