import type {
  IssuesEndpointTimelineResponse,
} from "./issuesContract";

export interface IssuesEndpointRequestOptions {
  signal?: AbortSignal;
}

export interface IssuesEndpointTimelineOptions extends IssuesEndpointRequestOptions {
  clusterId?: string;
  limit?: number;
}

export interface IssuesEndpointDetailOptions extends IssuesEndpointRequestOptions {
  clusterId?: string;
}

export interface IssuesEndpointPageOptions extends IssuesEndpointRequestOptions {
  correlationId?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface IssuesEndpointEvidenceOptions extends IssuesEndpointPageOptions {
  kind?: string;
}

export interface IssuesEndpointEvidenceSource {
  source: string;
  summary: string;
  schema_version: number | null;
  collector: string | null;
  collector_version: string | null;
  source_version: string | null;
  query_version: string | null;
  collected_at: string | null;
  evidence_key: string | null;
  source_id: string | null;
  agent_id: string | null;
  window_start: string | null;
}

export interface IssuesEndpointEvidenceRecord {
  id: number;
  workspace_id: string;
  correlation_id: string;
  kind: string;
  cluster_id: string | null;
  evidence_ref: string | null;
  summary: string;
  sources: IssuesEndpointEvidenceSource[];
  created_at: string | null;
}

export interface IssuesEndpointEvidencePage {
  items: IssuesEndpointEvidenceRecord[];
  limit: number;
  offset: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface IssuesEndpointCandidateScore {
  candidate_id: string;
  title: string | null;
  source: string | null;
  score: number | null;
  reason: string | null;
  supporting_evidence: string[];
  missing_evidence: string[];
}

export interface IssuesEndpointEvidenceRef {
  source: string;
  name: string;
  check_id: string | null;
  summary: string | null;
  query: string | null;
  evidence_ref: string | null;
  schema_version: number | null;
  source_version: string | null;
  collector: string | null;
  collector_version: string | null;
  query_version: string | null;
  collected_at: string | null;
  evidence_key: string | null;
  source_id: string | null;
  agent_id: string | null;
  window_start: string | null;
}

export interface IssuesEndpointMissingCheck {
  check_id: string;
  source: string | null;
  status: string | null;
  reason: string | null;
}

export interface IssuesEndpointRcaReport {
  id: number;
  workspace_id: string;
  correlation_id: string;
  root_cause: string;
  action: string;
  incident_id: string | null;
  cluster_id: string | null;
  symptom: string | null;
  severity: string | null;
  confidence: number | null;
  reason: string | null;
  evidence_ref: string | null;
  supporting_evidence: string[];
  missing_evidence: string[];
  created_at: string | null;
  resource_kind: string | null;
  resource_name: string | null;
  namespace: string | null;
  secondary_symptoms: string[];
  selected_candidate_id: string | null;
  candidates: IssuesEndpointCandidateScore[];
  supporting_evidence_refs: IssuesEndpointEvidenceRef[];
  missing_evidence_checks: IssuesEndpointMissingCheck[];
}

export interface IssuesEndpointRcaReportPage {
  items: IssuesEndpointRcaReport[];
  limit: number;
  offset: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface IssuesEndpointRecoveryCandidate {
  action_id: string;
  title: string;
  description: string;
  route: string;
  rank: number;
  score: number;
  risk_level: string;
  blast_radius: string;
  approval_required: boolean;
  prerequisites: string[];
  validation_checks: string[];
  rollback_plan: string;
  evidence_refs: string[];
}

export interface IssuesEndpointRecoveryPlan {
  plan_id: string;
  correlation_id: string;
  incident_id: string;
  evidence_ref: string;
  status: string;
  summary: string;
  target: Record<string, unknown>;
  recommended_action_id: string;
  execution_route: string;
  selection_required: boolean;
  selected_action_id: string | null;
  selected_by: string | null;
  selected_action: IssuesEndpointRecoveryCandidate | null;
  candidates: IssuesEndpointRecoveryCandidate[];
}

export interface IssuesEndpointRecoveryReceipt {
  accepted: boolean;
  event_id: string;
  correlation_id: string;
}

export interface IssuesEndpointRecoveryInput {
  reason?: string | null;
}

export interface IssuesEndpointDependencies {
  listRcaTimeline(
    options?: IssuesEndpointTimelineOptions,
  ): Promise<IssuesEndpointTimelineResponse>;
  getRcaIncident(
    incidentId: string,
    options?: IssuesEndpointDetailOptions,
  ): Promise<{ item: IssuesEndpointTimelineResponse["items"][number] }>;
  listEvidence(
    options?: IssuesEndpointEvidenceOptions,
  ): Promise<IssuesEndpointEvidencePage>;
  listRcaReports(
    options?: IssuesEndpointPageOptions,
  ): Promise<IssuesEndpointRcaReportPage>;
  getRecoveryPlanByCorrelation(
    correlationId: string,
    options?: IssuesEndpointRequestOptions,
  ): Promise<IssuesEndpointRecoveryPlan>;
  selectRecoveryAction(
    planId: string,
    actionId: string,
    input?: IssuesEndpointRecoveryInput,
    options?: IssuesEndpointRequestOptions,
  ): Promise<IssuesEndpointRecoveryReceipt>;
}
