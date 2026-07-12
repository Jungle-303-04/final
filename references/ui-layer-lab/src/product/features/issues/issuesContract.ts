export interface IssuesEndpointTimelineItem {
  workspace_id: unknown;
  correlation_id: unknown;
  cluster_id: unknown;
  incident_id: unknown;
  incident_namespace: unknown;
  incident_resource_kind: unknown;
  incident_resource_name: unknown;
  incident_symptom: unknown;
  evidence_ref: unknown;
  current_subject: unknown;
  status: unknown;
  root_cause: unknown;
  confidence: unknown;
  supporting_evidence: unknown;
  missing_evidence: unknown;
  action_route: unknown;
  command_id: unknown;
  pr_url: unknown;
  error_reason: unknown;
  updated_at: unknown;
}

export interface IssuesEndpointTimelineResponse {
  items: IssuesEndpointTimelineItem[];
}

export interface IssueDataQualityWarning {
  code:
    | "duplicate-issue-excluded"
    | "incident-link-unavailable"
    | "invalid-issue-excluded"
    | "optional-field-unavailable";
  field?: keyof IssuesEndpointTimelineItem;
  rowIndex: number;
}

export interface IssueSummary {
  id: string;
  incidentId: string | null;
  correlationId: string;
  workspaceId?: string;
  clusterId: string | null;
  namespace: string | null;
  resourceKind: string | null;
  resourceName: string | null;
  symptom: string | null;
  currentSubject: string;
  status: string;
  rootCause: string | null;
  confidence: number | null;
  supportingEvidence: readonly string[] | null;
  missingEvidence: readonly string[] | null;
  evidenceRef: string | null;
  actionRoute: string | null;
  commandId: string | null;
  pullRequestUrl: string | null;
  errorReason: string | null;
  updatedAt: string | null;
}

export interface IssueDetail extends Omit<IssueSummary, "missingEvidence" | "supportingEvidence"> {
  requestedClusterId: string | null;
  requestedIncidentId: string;
  dataQualityWarnings: IssueDataQualityWarning[];
  missingEvidence: readonly string[];
  supportingEvidence: readonly string[];
}

export interface IssueListRequest {
  clusterId: string | null;
  limit: number;
}

export interface IssueDetailRequest {
  clusterId: string | null;
  incidentId: string;
}

export interface IssueList {
  clusterId: string | null;
  completeness: "unknown";
  dataQualityWarnings: IssueDataQualityWarning[];
  excludedCount: number;
  items: IssueSummary[];
  limit: number;
  limitReached: boolean;
  returned: number;
}

export type IssuesPortFailureCode =
  | "forbidden"
  | "invalid-response"
  | "network"
  | "not-found"
  | "offline"
  | "rate-limited";

export class IssuesRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IssuesRequestError";
  }
}

export class IssuesCanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IssuesCanonicalError";
  }
}

export class IssuesPortFailure extends Error {
  readonly code: IssuesPortFailureCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: IssuesPortFailureCode, retryAfterSeconds: number | null = null) {
    super(`Issues port failed: ${code}`);
    this.name = "IssuesPortFailure";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
