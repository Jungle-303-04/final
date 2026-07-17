import type { BrowserRefreshPolicy } from "../../shared/data/browserRefreshPolicyRegistry";
import type {
  ClusterScope,
  ScopeTransitionOperationEvent,
} from "../../shared/parity/referenceParity";

export type HomeHealthTone =
  | "healthy"
  | "warning"
  | "critical"
  | "stale"
  | "unknown";

export type HomeConnectionState = "online" | "stale" | "pending" | "offline" | "unknown";
export type HomeRegistrationState = "active" | "pending" | "expired" | "unknown";
export type HomeClusterProvider = "eks" | "gke" | "aks" | "onprem" | "kind" | "unknown";
export type HomeConnectionStage =
  | "token_issued"
  | "awaiting_install"
  | "agent_connected"
  | "snapshot_received"
  | "ready"
  | "expired"
  | "error";
export type HomeCollectionCompleteness = "unknown";
export type HomeIdentityStability = "ephemeral";

export interface HomeClusterChoice {
  id: string;
  workspaceId: string;
  name: string;
  environment: string;
  provider: HomeClusterProvider;
  connectionStage: HomeConnectionStage | null;
  registrationState: HomeRegistrationState;
  connectionState: HomeConnectionState;
  lastObservedAt: string | null;
  nodeCount: number | null;
  podCount: number | null;
  namespaceCount?: number | null;
  kubernetesVersion?: string | null;
  crdDiscoveryStatus?: "exact" | "partial" | "unavailable" | null;
  incidentCount: number | null;
  serverCount?: number | null;
  appCount?: number | null;
  openIncidentCount?: number | null;
}

export interface HomeClusterChoices {
  completeness: HomeCollectionCompleteness;
  clusters: HomeClusterChoice[];
}

export interface HomeUsageSnapshot {
  observedAt: string | null;
  podsRunning: number;
  podsTotal: number;
  nodesReady: number;
  nodesTotal: number;
  restartCount: number;
  cpuPercent: number | null;
  memoryPercent: number | null;
}

export interface HomeWorkloadSummary {
  id: string;
  identityStability: HomeIdentityStability;
  name: string;
  kind: string;
  namespace: string | null;
  health: HomeHealthTone;
  ready: string;
  restartCount: number;
}

export interface HomeWarningSummary {
  id: string;
  identityStability: HomeIdentityStability;
  name: string;
  namespace: string | null;
  reason: string | null;
  message: string | null;
  involvedKind: string | null;
  involvedName: string | null;
  occurrenceCount: number;
  lastSeenAt: string | null;
}

export interface HomeIncidentSummary {
  id: string;
  /** Server incident identifier used only when a detail link is available. */
  incidentId: string | null;
  correlationId: string;
  symptom: string | null;
  rootCause: string | null;
  namespace: string | null;
  resourceKind: string | null;
  resourceName: string | null;
  status: string;
  createdAt: string | null;
}

export type HomeDataQualityWarningCode =
  | "usage-unavailable"
  | "workload-readiness-unavailable"
  | "incident-link-unavailable";

export interface HomeDataQualityWarning {
  code: HomeDataQualityWarningCode;
  section: "usage" | "workloads" | "incidents";
  /** Canonical row identity when the warning belongs to one row. */
  entityId: string | null;
}

export interface HomeClusterOverview {
  clusterId: string;
  name: string;
  health: HomeHealthTone;
  usage: HomeUsageSnapshot | null;
  workloads: HomeWorkloadSummary[];
  warnings: HomeWarningSummary[];
  incidents: HomeIncidentSummary[];
  dataQualityWarnings: HomeDataQualityWarning[];
}

export interface HomeNodeSummary {
  id: string;
  identityStability: HomeIdentityStability;
  name: string;
  kubernetesVersion: string | null;
  ready: boolean;
  health: HomeHealthTone;
  podsRunning: number;
  podsCapacity: number;
  cpuPercent: number | null;
  memoryPercent: number | null;
  restartCount: number;
  conditions: string[];
}

export interface HomeNodeCollection {
  clusterId: string;
  completeness: HomeCollectionCompleteness;
  nodes: HomeNodeSummary[];
}

export interface HomePodReadiness {
  ready: number;
  total: number;
}

export interface HomePodOwner {
  kind: string;
  name: string;
}

export interface HomePodSummary {
  id: string;
  identityStability: HomeIdentityStability;
  name: string;
  namespace: string;
  phase: string;
  health: HomeHealthTone;
  readiness: HomePodReadiness;
  restartCount: number;
  owner: HomePodOwner | null;
  cpuMillicores: number | null;
  memoryMebibytes: number | null;
  incidentCorrelationId: string | null;
}

export interface HomePodCollection {
  clusterId: string;
  nodeName: string;
  completeness: HomeCollectionCompleteness;
  pods: HomePodSummary[];
}

export type HomeInsightAvailability = "available" | "partial" | "unavailable";

export interface HomeInsightCoverage {
  availability: HomeInsightAvailability;
  observedAt: string | null;
  reasonCodes: readonly string[];
}

export interface HomeCustomResourceCount {
  apiGroup: string;
  version: string;
  kind: string;
  count: number;
}

export interface HomeCustomResourceSummary {
  coverage: HomeInsightCoverage;
  items: readonly HomeCustomResourceCount[];
  totalKinds: number | null;
  totalResources: number | null;
  hasMore: boolean;
}

export interface HomeHelmSummary {
  coverage: HomeInsightCoverage;
  releaseCount: number | null;
  statusCounts: Readonly<Record<string, number>>;
}

export type HomeCertificateExpiryStatus = "valid" | "expiring" | "expired";

export interface HomeCertificateResourceRef {
  apiGroup: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface HomeCertificateExpiryItem {
  secret: HomeCertificateResourceRef;
  sourceCertificate: HomeCertificateResourceRef;
  notAfter: string;
  status: HomeCertificateExpiryStatus;
  secondsRemaining: number;
  observedAt: string | null;
}

export interface HomeCertificateExpirySummary {
  coverage: HomeInsightCoverage;
  items: readonly HomeCertificateExpiryItem[];
  tlsSecretCount: number | null;
  observedExpiryCount: number | null;
  expiringCount: number | null;
  expiredCount: number | null;
  earliestExpiry: string | null;
  warningBeforeSeconds: number;
  hasMore: boolean;
}

export interface HomeTopologyPreviewSummary {
  coverage: HomeInsightCoverage;
  nodeCount: number | null;
  edgeCount: number | null;
  omittedNodeCount: number | null;
  omittedEdgeCount: number | null;
  relationCompleteness: "exact" | "partial" | "unavailable";
}

export interface HomeProviderAvailabilitySummary {
  coverage: HomeInsightCoverage;
}

export interface HomeExploreSummary {
  traffic: HomeProviderAvailabilitySummary;
  cost: HomeProviderAvailabilitySummary;
}

export interface HomeNetworkPolicyCoverageSummary {
  coverage: HomeInsightCoverage;
  totalPolicies: number | null;
  coveredWorkloads: number | null;
  totalWorkloads: number | null;
}

export interface HomeGitOpsControllerSummary {
  coverage: HomeInsightCoverage;
  controllerCount: number | null;
  providerCounts: Readonly<Record<string, number>>;
  healthCounts: Readonly<Record<string, number>>;
}

export interface HomeAuditFindingSummary {
  coverage: HomeInsightCoverage;
  totalCheckCount: number | null;
  totalFindingCount: number | null;
  severityCounts: Readonly<Partial<Record<"warning" | "danger", number>>>;
}

export interface HomePostureSummary {
  networkPolicy: HomeNetworkPolicyCoverageSummary;
  gitops: HomeGitOpsControllerSummary;
  audit: HomeAuditFindingSummary;
}

export interface HomeInsights {
  clusterId: string;
  topology: HomeTopologyPreviewSummary;
  explore: HomeExploreSummary;
  posture: HomePostureSummary;
  customResources: HomeCustomResourceSummary;
  helm: HomeHelmSummary;
  certificateExpiry: HomeCertificateExpirySummary;
  refreshAfterSeconds: number;
}

export interface HomeDashboardInvalidation {
  snapshotId: string;
}

export interface HomeDashboardInvalidationSubscription {
  onScopeOperation?: (event: ScopeTransitionOperationEvent) => void;
  signal?: AbortSignal;
}

export type HomeFailureCode =
  | "unauthorized"
  | "forbidden"
  | "offline"
  | "not-found"
  | "rate-limited"
  | "invalid-response"
  | "error";

export class HomePortFailure extends Error {
  readonly code: HomeFailureCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: HomeFailureCode, retryAfterSeconds: number | null = null) {
    super(`Home port failed: ${code}`);
    this.name = "HomePortFailure";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface HomePort {
  loadDashboardRefreshPolicy(signal?: AbortSignal): Promise<BrowserRefreshPolicy>;
  listClusterChoices(signal?: AbortSignal): Promise<HomeClusterChoices>;
  loadClusterOverview(clusterId: string, signal?: AbortSignal): Promise<HomeClusterOverview>;
  loadInsights(clusterId: string, signal?: AbortSignal): Promise<HomeInsights>;
  loadNodes(clusterId: string, signal?: AbortSignal): Promise<HomeNodeCollection>;
  loadNodePods(
    clusterId: string,
    nodeName: string,
    signal?: AbortSignal,
  ): Promise<HomePodCollection>;
  subscribeDashboardInvalidations(
    scope: ClusterScope,
    subscription?: HomeDashboardInvalidationSubscription,
  ): AsyncIterable<HomeDashboardInvalidation>;
}
