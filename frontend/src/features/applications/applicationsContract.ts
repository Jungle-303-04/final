export type ApplicationsFailureCode =
  | "forbidden"
  | "invalid-response"
  | "offline"
  | "unavailable"
  | "unknown";

export class ApplicationsFailure extends Error {
  readonly code: ApplicationsFailureCode;

  constructor(code: ApplicationsFailureCode) {
    super(`Applications request failed: ${code}`);
    this.name = "ApplicationsFailure";
    this.code = code;
  }
}

export interface ApplicationCatalogFilter {
  clusters: readonly string[];
  namespaces: readonly string[];
  applications: readonly string[];
  labels: readonly string[];
  environments: readonly string[];
  statuses: readonly string[];
  pendingPromotion: boolean;
  query: string;
}

export interface ApplicationHealth {
  status: "healthy" | "degraded" | "unknown";
  readyPods: number | null;
  totalPods: number | null;
  restarts: number | null;
}

export type ApplicationProjectionCompleteness = "exact" | "partial" | "unavailable";
export type ApplicationProjectionAvailability = "available" | "unavailable";

export interface ApplicationRuntimeReadiness {
  completeness: ApplicationProjectionCompleteness;
  status: "healthy" | "degraded" | "unknown";
  readyPods: number | null;
  totalPods: number | null;
  restarts: number | null;
}

export interface ApplicationDeliveryState {
  availability: ApplicationProjectionAvailability;
  status: "succeeded" | "failed" | "running" | "pending" | "unknown" | null;
  workflowRunId: string | null;
  observedAt: string | null;
}

export interface ApplicationBatchRuntime {
  availability: ApplicationProjectionAvailability;
  completeness: ApplicationProjectionCompleteness;
  status: "running" | "failed" | "succeeded" | "suspended" | "unknown" | null;
  activeRuns: number | null;
  failedRuns: number | null;
  succeededRuns: number | null;
}

export interface ApplicationCurrentDeployment {
  version: string | null;
  image: string | null;
  imageDigest: string | null;
  gitSha: string | null;
  deployedAt: string | null;
  deployedBy: string | null;
}

export interface ApplicationResourceCount {
  kind: string;
  count: number;
}

export interface ApplicationCardModel {
  id: string;
  name: string;
  environments: readonly string[];
  lifecycleStatus: string;
  health: ApplicationHealth;
  runtimeReadiness: ApplicationRuntimeReadiness;
  currentDeployment: ApplicationCurrentDeployment | null;
  delivery: ApplicationDeliveryState;
  batchRuntime: ApplicationBatchRuntime;
  hasDrift: boolean | null;
  driftSummary: string | null;
  resourceCounts: readonly ApplicationResourceCount[] | null;
  resourceCountsCompleteness: ApplicationProjectionCompleteness;
  openIncidents: number | null;
  repositoryRef: string | null;
  defaultBranch: string | null;
  manifestPath: string | null;
}

export interface ApplicationActivity {
  id: string;
  type: "deployment" | "incident" | "change";
  summary: string | null;
  occurredAt: string | null;
}

export interface ApplicationIncidentPreview {
  id: string;
  title: string | null;
  status: string;
  startedAt: string | null;
}

export interface ApplicationEndpoint {
  id: string;
  kind: string;
  name: string;
  address: string | null;
}

export interface ApplicationTopologyNode {
  id: string;
  clusterId: string;
  resourceType: string;
  kind: string;
  namespace: string | null;
  name: string;
  status: string;
  health: string;
  observedAt: string | null;
}

export interface ApplicationTopologyEdge {
  id: string;
  fromId: string;
  toId: string;
  type: "owns" | "runs_on" | "selects" | "routes_to";
  evidenceType: string;
  authority: "authoritative" | "derived";
  observedAt: string | null;
}

export interface ApplicationTopology {
  availability: ApplicationProjectionAvailability;
  completeness: ApplicationProjectionCompleteness;
  observedAt: string | null;
  nodes: readonly ApplicationTopologyNode[] | null;
  edges: readonly ApplicationTopologyEdge[] | null;
  partialReasonCodes: readonly string[];
}

export interface ApplicationHistoryEntry {
  id: string;
  type: "delivery" | "incident";
  status: string;
  summary: string | null;
  occurredAt: string | null;
  workflowRunId: string | null;
  gitOpsChangeId: string | null;
}

export interface ApplicationHistory {
  availability: ApplicationProjectionAvailability;
  completeness: ApplicationProjectionCompleteness;
  entries: readonly ApplicationHistoryEntry[] | null;
  partialReasonCodes: readonly string[];
}

export interface ApplicationSourceEvidence {
  availability: ApplicationProjectionAvailability;
  completeness: ApplicationProjectionCompleteness;
  conflict: "aligned" | "conflict" | "unknown" | null;
  repositoryRef: string | null;
  defaultBranch: string | null;
  manifestPath: string | null;
  partialReasonCodes: readonly string[];
}

export interface ApplicationInstanceScope {
  id: string;
  environment: string;
  status: string;
  scope: {
    workspaceId: string;
    clusterId: string;
    namespaces: readonly string[];
    freshness: "live" | "stale" | "partial" | "disconnected";
  };
}

export interface ApplicationDetailScope {
  availability: ApplicationProjectionAvailability;
  completeness: ApplicationProjectionCompleteness;
  selectedInstanceId: string | null;
  instances: readonly ApplicationInstanceScope[];
  partialReasonCodes: readonly string[];
}

export interface ApplicationDetailModel extends ApplicationCardModel {
  scope: ApplicationDetailScope;
  endpoints: readonly ApplicationEndpoint[] | null;
  endpointsCompleteness: "exact" | "partial" | "unavailable";
  recentActivity: readonly ApplicationActivity[];
  recentIncidents: readonly ApplicationIncidentPreview[];
  topology: ApplicationTopology;
  history: ApplicationHistory;
  source: ApplicationSourceEvidence;
}

export interface ApplicationDeploymentModel {
  id: string;
  environment: string | null;
  clusterId: string;
  gitSha: string | null;
  version: string | null;
  deployedAt: string | null;
  deployedBy: string | null;
  status: "succeeded" | "failed" | "running" | "pending" | "unknown";
  gitOpsChangeId: string | null;
}

export type ApplicationDriftValue = string | number | boolean | null;

export interface ApplicationDriftDifference {
  resource: string;
  fieldPath: string;
  oldValue: ApplicationDriftValue;
  newValue: ApplicationDriftValue;
  valueRedacted: boolean;
  changedBy: string | null;
  changedAt: string | null;
}

export interface ApplicationDriftModel {
  status: "in_sync" | "drifted" | "unknown";
  summary: string | null;
  differences: readonly ApplicationDriftDifference[];
  observedAt: string | null;
}

export interface ApplicationsPort {
  listApplications(
    filter: ApplicationCatalogFilter,
    signal?: AbortSignal,
  ): Promise<readonly ApplicationCardModel[]>;
  getApplication(
    applicationId: string,
    signal?: AbortSignal,
    instanceId?: string | null,
  ): Promise<ApplicationDetailModel>;
  listDeployments(
    applicationId: string,
    signal?: AbortSignal,
    instanceId?: string | null,
  ): Promise<readonly ApplicationDeploymentModel[]>;
  getDrift(
    applicationId: string,
    signal?: AbortSignal,
    instanceId?: string | null,
  ): Promise<ApplicationDriftModel>;
}

export interface ApplicationsApiDependencies {
  listApplicationCatalog(
    query: {
      clusters: readonly string[];
      namespaces: readonly string[];
      applications: readonly string[];
      labels: readonly string[];
      environments: readonly string[];
      statuses: readonly string[];
      pendingPromotion: boolean;
      query: string;
    },
    signal?: AbortSignal,
  ): Promise<ApplicationCatalogEndpoint>;
  getApplicationOverview(
    applicationId: string,
    signal?: AbortSignal,
    instanceId?: string | null,
  ): Promise<ApplicationDetailEndpoint>;
  listApplicationDeploymentHistory(
    applicationId: string,
    signal?: AbortSignal,
    instanceId?: string | null,
  ): Promise<ApplicationDeploymentHistoryEndpoint>;
  getApplicationDrift(
    applicationId: string,
    signal?: AbortSignal,
    instanceId?: string | null,
  ): Promise<ApplicationDriftEndpoint>;
}

export interface ApplicationCatalogEndpointItem {
  id: string;
  name: string;
  environments: string[];
  lifecycle_status: string;
  health: {
    status: "healthy" | "degraded" | "unknown";
    ready_pods: number | null;
    total_pods: number | null;
    restarts: number | null;
  };
  runtime_readiness: {
    completeness: ApplicationProjectionCompleteness;
    status: "healthy" | "degraded" | "unknown";
    ready_pods: number | null;
    total_pods: number | null;
    restarts: number | null;
  };
  current_deployment: {
    version: string | null;
    image: string | null;
    image_digest: string | null;
    git_sha: string | null;
    deployed_at: string | null;
    deployed_by: string | null;
  } | null;
  delivery: {
    availability: ApplicationProjectionAvailability;
    status: "succeeded" | "failed" | "running" | "pending" | "unknown" | null;
    workflow_run_id: string | null;
    observed_at: string | null;
  };
  batch_runtime: {
    availability: ApplicationProjectionAvailability;
    completeness: ApplicationProjectionCompleteness;
    status: "running" | "failed" | "succeeded" | "suspended" | "unknown" | null;
    active_runs: number | null;
    failed_runs: number | null;
    succeeded_runs: number | null;
  };
  has_drift: boolean | null;
  drift_summary: string | null;
  resource_counts: { kind: string; count: number }[] | null;
  resource_counts_completeness: ApplicationProjectionCompleteness;
  open_incidents: number | null;
  repository_ref: string | null;
  default_branch: string | null;
  manifest_path: string | null;
}

export interface ApplicationDetailEndpointItem extends ApplicationCatalogEndpointItem {
  scope: {
    availability: ApplicationProjectionAvailability;
    completeness: ApplicationProjectionCompleteness;
    selected_instance_id: string | null;
    instances: {
      id: string;
      environment: string;
      status: string;
      scope: {
        workspace_id: string;
        cluster_id: string;
        namespaces: string[];
        freshness: "live" | "stale" | "partial" | "disconnected";
      };
    }[];
    partial_reason_codes: string[];
  };
  endpoints: { id: string; kind: string; name: string; url: string }[] | null;
  endpoints_completeness: "exact" | "partial" | "unavailable";
  recent_activity: {
    id: string;
    type: "deployment" | "incident" | "change";
    summary: string | null;
    occurred_at: string | null;
  }[];
  recent_incidents: {
    id: string;
    title: string | null;
    status: string;
    started_at: string | null;
  }[];
  topology: {
    availability: ApplicationProjectionAvailability;
    completeness: ApplicationProjectionCompleteness;
    observed_at: string | null;
    nodes: {
      id: string;
      cluster_id: string;
      resource_type: string;
      kind: string;
      namespace: string | null;
      name: string;
      status: string;
      health: string;
      observed_at: string | null;
    }[] | null;
    edges: {
      id: string;
      from_id: string;
      to_id: string;
      type: "owns" | "runs_on" | "selects" | "routes_to";
      evidence_type: string;
      authority: "authoritative" | "derived";
      observed_at: string | null;
    }[] | null;
    partial_reason_codes: string[];
  };
  history: {
    availability: ApplicationProjectionAvailability;
    completeness: ApplicationProjectionCompleteness;
    entries: {
      id: string;
      type: "delivery" | "incident";
      status: string;
      summary: string | null;
      occurred_at: string | null;
      workflow_run_id: string | null;
      gitops_change_id: string | null;
    }[] | null;
    partial_reason_codes: string[];
  };
  source: {
    availability: ApplicationProjectionAvailability;
    completeness: ApplicationProjectionCompleteness;
    conflict: "aligned" | "conflict" | "unknown" | null;
    repository_ref: string | null;
    default_branch: string | null;
    manifest_path: string | null;
    partial_reason_codes: string[];
  };
}

interface ApplicationCatalogEndpoint {
  applications: ApplicationCatalogEndpointItem[];
}

interface ApplicationDetailEndpoint {
  application: ApplicationDetailEndpointItem;
}

interface ApplicationDeploymentHistoryEndpoint {
  deployments: {
    id: string;
    environment: string | null;
    cluster_id: string;
    git_sha: string | null;
    version: string | null;
    deployed_at: string | null;
    deployed_by: string | null;
    status: "succeeded" | "failed" | "running" | "pending" | "unknown";
    gitops_change_id: string | null;
  }[];
}

interface ApplicationDriftEndpoint {
  status: "in_sync" | "drifted" | "unknown";
  summary: string | null;
  differences: {
    resource: string;
    field_path: string;
    old_value: ApplicationDriftValue;
    new_value: ApplicationDriftValue;
    value_redacted: boolean;
    changed_by: string | null;
    changed_at: string | null;
  }[];
  observed_at: string | null;
}
