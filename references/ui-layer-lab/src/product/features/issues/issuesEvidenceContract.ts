export interface IssuePageQuery {
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface IssueEvidenceQuery extends IssuePageQuery {
  kind?: string;
}

export interface IssueEvidenceSource {
  source: string;
  summary: string;
  schemaVersion: number | null;
  collector: string | null;
  collectorVersion: string | null;
  sourceVersion: string | null;
  queryVersion: string | null;
  collectedAt: string | null;
  evidenceKey: string | null;
  sourceId: string | null;
  agentId: string | null;
  windowStart: string | null;
}

export interface IssueEvidenceRecord {
  id: string;
  correlationId: string;
  kind: string;
  clusterId: string | null;
  evidenceRef: string | null;
  summary: string;
  sources: IssueEvidenceSource[];
  createdAt: string | null;
}

export interface IssueEvidencePage {
  correlationId: string;
  items: IssueEvidenceRecord[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface IssueCandidateScore {
  id: string;
  title: string | null;
  source: string | null;
  score: number | null;
  reason: string | null;
  supportingEvidence: string[];
  missingEvidence: string[];
}

export interface IssueEvidenceReference {
  source: string;
  name: string;
  checkId: string | null;
  summary: string | null;
  query: string | null;
  evidenceRef: string | null;
  collectedAt: string | null;
}

export interface IssueMissingEvidenceCheck {
  checkId: string;
  source: string | null;
  status: string | null;
  reason: string | null;
}

export interface IssueRcaReport {
  id: string;
  correlationId: string;
  incidentId: string | null;
  clusterId: string | null;
  namespace: string | null;
  resourceKind: string | null;
  resourceName: string | null;
  rootCause: string;
  action: string;
  symptom: string | null;
  severity: string | null;
  confidence: number | null;
  reason: string | null;
  evidenceRef: string | null;
  supportingEvidence: string[];
  missingEvidence: string[];
  secondarySymptoms: string[];
  selectedCandidateId: string | null;
  candidates: IssueCandidateScore[];
  supportingEvidenceRefs: IssueEvidenceReference[];
  missingEvidenceChecks: IssueMissingEvidenceCheck[];
  createdAt: string | null;
}

export interface IssueRcaReportPage {
  correlationId: string;
  items: IssueRcaReport[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextCursor: string | null;
}
