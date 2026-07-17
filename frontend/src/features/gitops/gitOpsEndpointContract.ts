import type {
  GeneratedManifest,
  ReleasePlan,
  ReleasePreview,
  ReleaseReadiness,
  ReleaseRun,
  ReleaseRunAction,
  ReleaseTargetInput,
  SafePrResult,
  GitOpsReasonCode,
  GitOpsSyncTargetQuery,
} from "./gitOpsContract";
import type { GitOpsOverviewEndpoint } from "../../api/gitops-overview-schemas";

type EndpointResourceRef = GitOpsApplicationDetailEndpoint["application"]["resource"];
type EndpointClusterScope = NonNullable<GitOpsApplicationDetailEndpoint["application"]["scope"]["scope"]>;

export interface GitOpsResourceTreeEndpoint {
  scope: EndpointClusterScope;
  root: EndpointResourceRef;
  nodes: {
    id: string;
    resource: EndpointResourceRef;
    role: "root" | "declared" | "generated" | "source" | "dependency";
    status: string | null;
    health: string | null;
  }[];
  edges: { source: string; target: string; relationship: "owns" | "source" | "depends_on" }[];
  coverage: {
    state: "complete" | "partial";
    reason_codes: string[];
    observed_count: number;
    returned_count: number;
  };
}

export interface GitOpsResourceInsightsEndpoint {
  insights: {
    scope: EndpointClusterScope;
    resource: EndpointResourceRef;
    resource_version: string;
    provider: "argo" | "flux";
    status: string | null;
    health: string | null;
    revision: string | null;
    source: EndpointResourceRef | null;
    conditions: {
      type: string;
      status: string;
      reason: string | null;
      message: string | null;
      observed_at: string | null;
    }[];
    history: {
      id: string | null;
      revision: string | null;
      deployed_at: string | null;
      phase: string | null;
      message: string | null;
      initiated_by: string | null;
    }[];
    capabilities: {
      scope: EndpointClusterScope;
      resource: EndpointResourceRef;
      revision: string;
      actions: ("reconcile" | "sync_with_source" | "suspend" | "resume" | "sync" | "refresh")[];
    };
  };
}

export interface GitOpsResourceActionEndpointRequest {
  cluster_id: string;
  resource: EndpointResourceRef;
  resource_version: string;
  capability_revision: string;
  action: "reconcile" | "sync_with_source" | "suspend" | "resume" | "sync" | "refresh";
  confirmation: true;
  reason: string;
  refresh_mode?: "normal" | "hard";
  options?: {
    revision?: string;
    prune: boolean;
    dry_run: boolean;
    force: boolean;
    apply_only: boolean;
    sync_options: string[];
    resources: { api_group: string; kind: string; namespace: string | null; name: string }[];
  };
}

export interface GitOpsCommandAcceptedEndpoint {
  accepted: true;
  event_id: string;
  audit_event_id: string;
  correlation_id: string;
  command_id: string;
  status: "queued" | "leased" | "running" | "cancel_requested" | "cancelling" | "completed" | "failed" | "cancelled";
}

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
      reason_code: GitOpsReasonCode | null;
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
      reason_code: GitOpsReasonCode | null;
    };
    operation: {
      availability: "available" | "partial" | "unavailable";
      in_progress: boolean | null;
      workflow_run_id: string | null;
      status: string | null;
      observed_at: string | null;
      reason_code: GitOpsReasonCode | null;
    };
    capabilities: [{
      action: "refresh" | "sync";
      authorization: "allowed" | "denied";
      availability: "available" | "partial" | "unavailable";
      enabled: false;
      operation_blocked: boolean;
      reason_code: GitOpsReasonCode | null;
    }, {
      action: "refresh" | "sync";
      authorization: "allowed" | "denied";
      availability: "available" | "partial" | "unavailable";
      enabled: false;
      operation_blocked: boolean;
      reason_code: GitOpsReasonCode | null;
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
  getResourceTree?(
    locator: { clusterId: string; apiVersion: string; kind: string; namespace: string; name: string },
    signal?: AbortSignal,
  ): Promise<GitOpsResourceTreeEndpoint>;
  getResourceInsights?(
    locator: { clusterId: string; apiVersion: string; kind: string; namespace: string; name: string },
    signal?: AbortSignal,
  ): Promise<GitOpsResourceInsightsEndpoint>;
  executeResourceAction?(
    locator: { clusterId: string; apiVersion: string; kind: string; namespace: string; name: string },
    request: GitOpsResourceActionEndpointRequest,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<GitOpsCommandAcceptedEndpoint>;
  listOverview(
    query?: GitOpsSyncTargetQuery,
    signal?: AbortSignal,
  ): Promise<GitOpsOverviewEndpoint>;
  listApplications(signal?: AbortSignal): Promise<{
    applications: Record<string, unknown>[];
  }>;
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
