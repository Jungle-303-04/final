export interface ChecksEndpointClusterScope {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: "live" | "stale" | "partial" | "disconnected";
}

export interface ChecksEndpointScopeCoverage {
  availability: "available" | "partial" | "unavailable";
  scopes: ChecksEndpointClusterScope[];
  observed_at: string | null;
  reason_codes: string[];
}

export interface ChecksOverviewEndpoint {
  scope_coverage: ChecksEndpointScopeCoverage;
  result_set: ChecksEndpointResultSet;
  catalog: ChecksEndpointCatalog;
  visibility: {
    availability: "available" | "partial" | "unavailable";
    clusters: ChecksEndpointVisibility[];
    reason_codes: string[];
  };
}

export type ChecksEndpointResultSet = {
  availability: "available" | "partial";
  evaluated_at: string;
  checks: ChecksEndpointFinding[];
  total_check_count: number;
  total_finding_count: number;
  reason_codes: string[];
} | {
  availability: "unavailable";
  evaluated_at: null;
  checks: null;
  total_check_count: null;
  total_finding_count: null;
  reason_codes: string[];
};

export type ChecksEndpointCatalog = {
  availability: "available" | "partial";
  entries: ChecksEndpointCatalogEntry[];
  reason_codes: string[];
} | {
  availability: "unavailable";
  entries: null;
  reason_codes: string[];
};

export interface ChecksEndpointFinding {
  finding_id: string;
  cluster_id: string;
  check_id: string;
  category: string;
  severity: "warning" | "danger";
  message: string;
  resource: {
    api_group: string;
    version: string;
    kind: string;
    namespace: string | null;
    name: string;
    uid: string;
  };
}

export interface ChecksEndpointCatalogEntry {
  check_id: string;
  title: string;
  category: string;
  severity: "warning" | "danger";
  description: string;
  remediation: string;
}

export interface ChecksEndpointVisibility {
  cluster_id: string;
  state: "ok" | "limited" | "degraded";
  namespace_scope: string[];
  core: Record<string, "allowed" | "namespace_limited" | "unavailable">;
  missing_optional_kinds: string[];
}

export interface ChecksDetailEndpoint {
  scope_coverage: ChecksEndpointScopeCoverage;
  detail: ChecksEndpointDetail;
}

export type ChecksEndpointDetail = {
  requested_check_id: string;
  availability: "available" | "partial";
  title: string;
  category: string;
  effective_severity: "warning" | "danger";
  message: string;
  remediation: string;
  affected_resource_count: number;
  findings: ChecksEndpointFinding[];
  reason_codes: string[];
} | {
  requested_check_id: string;
  availability: "unavailable";
  title: null;
  category: null;
  effective_severity: null;
  message: null;
  remediation: null;
  affected_resource_count: null;
  findings: null;
  reason_codes: string[];
};

export interface ChecksEndpointDependencies {
  getChecksOverview(
    query: { clusterIds?: readonly string[]; namespaces?: readonly string[] },
    signal?: AbortSignal,
  ): Promise<ChecksOverviewEndpoint>;
  getChecksDetail(
    checkId: string,
    query: { clusterIds?: readonly string[]; namespaces?: readonly string[] },
    signal?: AbortSignal,
  ): Promise<ChecksDetailEndpoint>;
}
