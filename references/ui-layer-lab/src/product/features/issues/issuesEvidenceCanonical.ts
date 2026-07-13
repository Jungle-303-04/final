import type {
  IssueCandidateScore,
  IssueEvidencePage,
  IssueEvidenceRecord,
  IssueEvidenceReference,
  IssueEvidenceSource,
  IssueMissingEvidenceCheck,
  IssueRcaReport,
  IssueRcaReportPage,
} from "./issuesEvidenceContract";
import type {
  IssuesEndpointCandidateScore,
  IssuesEndpointEvidencePage,
  IssuesEndpointEvidenceRecord,
  IssuesEndpointEvidenceRef,
  IssuesEndpointEvidenceSource,
  IssuesEndpointMissingCheck,
  IssuesEndpointRcaReport,
  IssuesEndpointRcaReportPage,
} from "./issuesEndpointContract";
import { IssuesCanonicalError } from "./issuesContract";

export function toIssueEvidencePage(
  correlationId: string,
  response: IssuesEndpointEvidencePage,
): IssueEvidencePage {
  validatePage(response.limit, response.offset, response.has_more, response.next_cursor);
  return {
    correlationId,
    items: uniqueItems(response.items.map((item) => evidenceRecord(correlationId, item))),
    limit: response.limit,
    offset: response.offset,
    hasMore: response.has_more,
    nextCursor: response.next_cursor,
  };
}

export function toIssueRcaReportPage(
  correlationId: string,
  response: IssuesEndpointRcaReportPage,
): IssueRcaReportPage {
  validatePage(response.limit, response.offset, response.has_more, response.next_cursor);
  return {
    correlationId,
    items: uniqueItems(response.items.map((item) => rcaReport(correlationId, item))),
    limit: response.limit,
    offset: response.offset,
    hasMore: response.has_more,
    nextCursor: response.next_cursor,
  };
}

function evidenceRecord(
  correlationId: string,
  item: IssuesEndpointEvidenceRecord,
): IssueEvidenceRecord {
  const workspaceId = required(item.workspace_id, "evidence workspace_id");
  requireCorrelation(correlationId, item.correlation_id);
  return {
    id: `evidence:${encodeURIComponent(workspaceId)}/${item.id}`,
    correlationId,
    kind: required(item.kind, "evidence kind"),
    clusterId: optional(item.cluster_id),
    evidenceRef: optional(item.evidence_ref),
    summary: item.summary,
    sources: item.sources.map(evidenceSource),
    createdAt: timestamp(item.created_at),
  };
}

function evidenceSource(source: IssuesEndpointEvidenceSource): IssueEvidenceSource {
  return {
    source: required(source.source, "evidence source"),
    summary: source.summary,
    schemaVersion: source.schema_version,
    collector: optional(source.collector),
    collectorVersion: optional(source.collector_version),
    sourceVersion: optional(source.source_version),
    queryVersion: optional(source.query_version),
    collectedAt: timestamp(source.collected_at),
    evidenceKey: optional(source.evidence_key),
    sourceId: optional(source.source_id),
    agentId: optional(source.agent_id),
    windowStart: timestamp(source.window_start),
  };
}

function rcaReport(
  correlationId: string,
  item: IssuesEndpointRcaReport,
): IssueRcaReport {
  const workspaceId = required(item.workspace_id, "RCA report workspace_id");
  requireCorrelation(correlationId, item.correlation_id);
  return {
    id: `rca-report:${encodeURIComponent(workspaceId)}/${item.id}`,
    correlationId,
    incidentId: optional(item.incident_id),
    clusterId: optional(item.cluster_id),
    namespace: optional(item.namespace),
    resourceKind: optional(item.resource_kind),
    resourceName: optional(item.resource_name),
    rootCause: item.root_cause,
    action: item.action,
    symptom: optional(item.symptom),
    severity: optional(item.severity),
    confidence: finiteOrNull(item.confidence, "RCA report confidence"),
    reason: optional(item.reason),
    evidenceRef: optional(item.evidence_ref),
    supportingEvidence: [...item.supporting_evidence],
    missingEvidence: [...item.missing_evidence],
    secondarySymptoms: [...item.secondary_symptoms],
    selectedCandidateId: optional(item.selected_candidate_id),
    candidates: item.candidates.map(candidateScore),
    supportingEvidenceRefs: item.supporting_evidence_refs.map(evidenceReference),
    missingEvidenceChecks: item.missing_evidence_checks.map(missingCheck),
    createdAt: timestamp(item.created_at),
  };
}

function candidateScore(item: IssuesEndpointCandidateScore): IssueCandidateScore {
  return {
    id: required(item.candidate_id, "candidate_id"),
    title: optional(item.title),
    source: optional(item.source),
    score: finiteOrNull(item.score, "candidate score"),
    reason: optional(item.reason),
    supportingEvidence: [...item.supporting_evidence],
    missingEvidence: [...item.missing_evidence],
  };
}

function evidenceReference(item: IssuesEndpointEvidenceRef): IssueEvidenceReference {
  return {
    source: required(item.source, "evidence reference source"),
    name: required(item.name, "evidence reference name"),
    checkId: optional(item.check_id),
    summary: optional(item.summary),
    query: optional(item.query),
    evidenceRef: optional(item.evidence_ref),
    collectedAt: timestamp(item.collected_at),
  };
}

function missingCheck(item: IssuesEndpointMissingCheck): IssueMissingEvidenceCheck {
  return {
    checkId: required(item.check_id, "missing evidence check_id"),
    source: optional(item.source),
    status: optional(item.status),
    reason: optional(item.reason),
  };
}

function validatePage(
  limit: number,
  offset: number,
  hasMore: boolean,
  nextCursor: string | null,
): void {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) {
    throw new IssuesCanonicalError("Invalid Issues page metadata");
  }
  if (hasMore && optional(nextCursor) === null) {
    throw new IssuesCanonicalError("Issues page has_more requires next_cursor");
  }
}

function uniqueItems<T extends { id: string }>(items: T[]): T[] {
  if (new Set(items.map(({ id }) => id)).size !== items.length) {
    throw new IssuesCanonicalError("Issues page contains duplicate identities");
  }
  return items;
}

function requireCorrelation(expected: string, actual: string): void {
  if (required(actual, "correlation_id") !== expected) {
    throw new IssuesCanonicalError("Issues page correlation_id does not match request");
  }
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new IssuesCanonicalError(`${field} is required`);
  return normalized;
}

function optional(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function finiteOrNull(value: number | null, field: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new IssuesCanonicalError(`${field} must be finite`);
  return value;
}

function timestamp(value: string | null): string | null {
  const normalized = optional(value);
  if (normalized === null) return null;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
