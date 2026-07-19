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
