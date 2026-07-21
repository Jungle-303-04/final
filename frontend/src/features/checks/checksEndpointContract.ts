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
  result_set: {
    availability: "unavailable";
    evaluated_at: null;
    checks: null;
    total_check_count: null;
    total_finding_count: null;
    reason_codes: string[];
  };
  catalog: {
    availability: "unavailable";
    entries: null;
    reason_codes: string[];
  };
}

export interface ChecksDetailEndpoint {
  scope_coverage: ChecksEndpointScopeCoverage;
  detail: {
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
}

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
