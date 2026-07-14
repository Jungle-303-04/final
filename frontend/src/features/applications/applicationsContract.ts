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
  currentDeployment: ApplicationCurrentDeployment | null;
  hasDrift: boolean | null;
  driftSummary: string | null;
  resourceCounts: readonly ApplicationResourceCount[] | null;
  resourceCountsCompleteness: "exact" | "partial" | "unavailable";
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

export interface ApplicationDetailModel extends ApplicationCardModel {
  endpoints: readonly ApplicationEndpoint[] | null;
  endpointsCompleteness: "exact" | "partial" | "unavailable";
  recentActivity: readonly ApplicationActivity[];
  recentIncidents: readonly ApplicationIncidentPreview[];
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
  getApplication(applicationId: string, signal?: AbortSignal): Promise<ApplicationDetailModel>;
  listDeployments(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<readonly ApplicationDeploymentModel[]>;
  getDrift(applicationId: string, signal?: AbortSignal): Promise<ApplicationDriftModel>;
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
  ): Promise<ApplicationDetailEndpoint>;
  listApplicationDeploymentHistory(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<ApplicationDeploymentHistoryEndpoint>;
  getApplicationDrift(
    applicationId: string,
    signal?: AbortSignal,
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
  current_deployment: {
    version: string | null;
    image: string | null;
    image_digest: string | null;
    git_sha: string | null;
    deployed_at: string | null;
    deployed_by: string | null;
  } | null;
  has_drift: boolean | null;
  drift_summary: string | null;
  resource_counts: { kind: string; count: number }[] | null;
  resource_counts_completeness: "exact" | "partial" | "unavailable";
  open_incidents: number | null;
  repository_ref: string | null;
  default_branch: string | null;
  manifest_path: string | null;
}

export interface ApplicationDetailEndpointItem extends ApplicationCatalogEndpointItem {
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
