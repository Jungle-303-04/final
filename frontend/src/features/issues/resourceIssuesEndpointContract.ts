export interface ResourceIssueEndpointItem {
  workspace_id: string;
  correlation_id: string;
  cluster_id: string | null;
  incident_id: string | null;
  incident_namespace: string | null;
  incident_resource_kind: string | null;
  incident_resource_name: string | null;
  incident_symptom: string | null;
  evidence_ref: string | null;
  current_subject: string;
  status: string;
  root_cause: string | null;
  confidence: number | null;
  supporting_evidence: string[];
  missing_evidence: string[];
  action_route: string | null;
  command_id: string | null;
  pr_url: string | null;
  error_reason: string | null;
  updated_at: string | null;
  issue_severity: "critical" | "warning" | null;
  severity_availability: "available" | "unavailable";
  severity_reason_code: "source_incomplete" | "outside_two_tier_scale" | null;
  onset: {
    first_observed_at: string;
    source: "timeline_created_at";
    timing_kind: null;
    timing_availability: "unavailable";
    timing_reason_code: "health_transition_evidence_unavailable";
  };
}

export interface ResourceIssueEndpointResponse {
  scope: {
    workspace_id: string;
    cluster_id: string;
    namespaces: string[];
    freshness: "live" | "stale" | "partial" | "disconnected";
  };
  coverage_availability: "available" | "partial" | "unavailable";
  observed_at: string | null;
  reason_codes: string[];
  items: ResourceIssueEndpointItem[];
  limit: number;
  has_more: boolean;
}

export interface ResourceIssuesEndpointDependencies {
  getResourceIssues(
    query: {
      clusterId: string;
      kind: string;
      namespace: string | null;
      name: string;
      limit: number;
    },
    signal?: AbortSignal,
  ): Promise<ResourceIssueEndpointResponse>;
}
