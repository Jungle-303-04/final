import {
  IssuesCanonicalError,
  type IssueDataQualityWarning,
  type IssueDetail,
  type IssueDetailRequest,
  type IssueList,
  type IssueListRequest,
  type IssueSummary,
  type IssuesEndpointTimelineItem,
  type IssuesEndpointTimelineResponse,
} from "./issuesContract";
import { issueStableId } from "./issuesValidation";

interface ProjectionResult {
  issue: IssueSummary;
  warnings: IssueDataQualityWarning[];
}

export function toIssueList(
  request: IssueListRequest,
  response: IssuesEndpointTimelineResponse,
): IssueList {
  if (response.items.length > request.limit) {
    throw new IssuesCanonicalError("Issues response exceeds requested limit");
  }

  const seen = new Set<string>();
  const dataQualityWarnings: IssueDataQualityWarning[] = [];
  const items: IssueSummary[] = [];
  let excludedCount = 0;

  response.items.forEach((item, rowIndex) => {
    const projected = projectIssue(item, rowIndex, { requireIncidentId: false });
    if (projected === null) {
      excludedCount += 1;
      dataQualityWarnings.push({ code: "invalid-issue-excluded", rowIndex });
      return;
    }

    if (
      request.clusterId !== null
      && projected.issue.clusterId !== null
      && projected.issue.clusterId !== request.clusterId
    ) {
      excludedCount += 1;
      dataQualityWarnings.push({
        code: "invalid-issue-excluded",
        field: "cluster_id",
        rowIndex,
      });
      return;
    }

    if (seen.has(projected.issue.id)) {
      excludedCount += 1;
      dataQualityWarnings.push({
        code: "duplicate-issue-excluded",
        rowIndex,
      });
      return;
    }

    seen.add(projected.issue.id);
    items.push(projected.issue);
    dataQualityWarnings.push(...projected.warnings);
  });

  return {
    clusterId: request.clusterId,
    completeness: "unknown",
    dataQualityWarnings,
    excludedCount,
    items,
    limit: request.limit,
    limitReached: items.length === request.limit,
    returned: items.length,
  };
}

export function toIssueDetail(
  request: IssueDetailRequest,
  response: { item: IssuesEndpointTimelineItem },
): IssueDetail {
  const projected = projectIssue(response.item, 0, { requireIncidentId: true });
  if (projected === null || projected.issue.incidentId === null) {
    throw new IssuesCanonicalError("Invalid issue detail response");
  }
  if (projected.issue.incidentId !== request.incidentId) {
    throw new IssuesCanonicalError("Issue detail incident id does not match request");
  }
  if (
    request.clusterId !== null
    && projected.issue.clusterId !== null
    && projected.issue.clusterId !== request.clusterId
  ) {
    throw new IssuesCanonicalError("Issue detail cluster id does not match request");
  }

  return {
    ...projected.issue,
    requestedClusterId: request.clusterId,
    requestedIncidentId: request.incidentId,
    dataQualityWarnings: projected.warnings,
    missingEvidence: projected.issue.missingEvidence ?? [],
    supportingEvidence: projected.issue.supportingEvidence ?? [],
  };
}

function projectIssue(
  item: IssuesEndpointTimelineItem,
  rowIndex: number,
  options: { requireIncidentId: boolean },
): ProjectionResult | null {
  const workspaceId = requiredString(item.workspace_id);
  const correlationId = requiredString(item.correlation_id);
  const currentSubject = requiredString(item.current_subject);
  const status = requiredString(item.status);
  if (
    workspaceId === null
    || correlationId === null
    || currentSubject === null
    || status === null
  ) {
    return null;
  }

  const warnings: IssueDataQualityWarning[] = [];
  const severityProjection = projectIssueSeverity(item, rowIndex, warnings);
  const issue: IssueSummary = {
    id: issueStableId(workspaceId, correlationId),
    incidentId: incidentId(item.incident_id, rowIndex, warnings, options.requireIncidentId),
    correlationId,
    workspaceId,
    clusterId: optionalString(item.cluster_id, "cluster_id", rowIndex, warnings),
    namespace: optionalString(
      item.incident_namespace,
      "incident_namespace",
      rowIndex,
      warnings,
    ),
    resourceKind: optionalString(
      item.incident_resource_kind,
      "incident_resource_kind",
      rowIndex,
      warnings,
    ),
    resourceName: optionalString(
      item.incident_resource_name,
      "incident_resource_name",
      rowIndex,
      warnings,
    ),
    symptom: optionalString(item.incident_symptom, "incident_symptom", rowIndex, warnings),
    currentSubject,
    status,
    ...severityProjection,
    rootCause: optionalString(item.root_cause, "root_cause", rowIndex, warnings),
    confidence: confidence(item.confidence, rowIndex, warnings),
    supportingEvidence: optionalStringList(
      item.supporting_evidence,
      "supporting_evidence",
      rowIndex,
      warnings,
    ),
    missingEvidence: optionalStringList(
      item.missing_evidence,
      "missing_evidence",
      rowIndex,
      warnings,
    ),
    evidenceRef: optionalString(item.evidence_ref, "evidence_ref", rowIndex, warnings),
    actionRoute: actionRoute(item.action_route, rowIndex, warnings),
    commandId: optionalString(item.command_id, "command_id", rowIndex, warnings),
    pullRequestUrl: pullRequestUrl(item.pr_url, rowIndex, warnings),
    errorReason: optionalString(item.error_reason, "error_reason", rowIndex, warnings),
    updatedAt: timestamp(item.updated_at, rowIndex, warnings),
    situationSummary: optionalString(
      item.situation_summary,
      "situation_summary",
      rowIndex,
      warnings,
    ),
    recommendedActionSummary: optionalString(
      item.recommended_action_summary,
      "recommended_action_summary",
      rowIndex,
      warnings,
    ),
    evidenceSummary: optionalString(item.evidence_summary, "evidence_summary", rowIndex, warnings),
    evidenceBundleSummary: optionalString(
      item.evidence_bundle_summary,
      "evidence_bundle_summary",
      rowIndex,
      warnings,
    ),
  };

  if (options.requireIncidentId && issue.incidentId === null) return null;
  return { issue, warnings };
}

function projectIssueSeverity(
  item: IssuesEndpointTimelineItem,
  rowIndex: number,
  warnings: IssueDataQualityWarning[],
): Pick<IssueSummary, "severity" | "severityAvailability"> {
  const availability = item.severity_availability;
  const severity = item.issue_severity;
  const reason = item.severity_reason_code;
  // The legacy timeline intentionally has none of these additive fields. It
  // remains a read-only rollout fallback rather than a claim that severity is
  // unavailable in the underlying incident.
  if (availability === undefined && severity === undefined && reason === undefined) {
    return {};
  }
  if (
    availability === "available"
    && (severity === "critical" || severity === "warning")
    && reason === null
  ) {
    return { severity, severityAvailability: "available" };
  }
  if (
    availability === "unavailable"
    && severity === null
    && (reason === "source_incomplete" || reason === "outside_two_tier_scale")
  ) {
    return { severity: null, severityAvailability: "unavailable" };
  }
  warnings.push({
    code: "optional-field-unavailable",
    field: "issue_severity",
    rowIndex,
  });
  return {};
}

function requiredString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function incidentId(
  value: unknown,
  rowIndex: number,
  warnings: IssueDataQualityWarning[],
  requireIncidentId: boolean,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    warnings.push({ code: "incident-link-unavailable", field: "incident_id", rowIndex });
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    if (requireIncidentId) return null;
    warnings.push({ code: "incident-link-unavailable", field: "incident_id", rowIndex });
    return null;
  }
  return normalized;
}

function optionalString(
  value: unknown,
  field: keyof IssuesEndpointTimelineItem,
  rowIndex: number,
  warnings: IssueDataQualityWarning[],
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    warnings.push({ code: "optional-field-unavailable", field, rowIndex });
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function optionalStringList(
  value: unknown,
  field: keyof IssuesEndpointTimelineItem,
  rowIndex: number,
  warnings: IssueDataQualityWarning[],
): readonly string[] | null {
  if (!Array.isArray(value)) {
    warnings.push({ code: "optional-field-unavailable", field, rowIndex });
    return null;
  }
  if (!value.every((item) => typeof item === "string")) {
    warnings.push({ code: "optional-field-unavailable", field, rowIndex });
    return null;
  }
  return value;
}

function confidence(
  value: unknown,
  rowIndex: number,
  warnings: IssueDataQualityWarning[],
): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    warnings.push({ code: "optional-field-unavailable", field: "confidence", rowIndex });
    return null;
  }
  return value;
}

function actionRoute(
  value: unknown,
  rowIndex: number,
  warnings: IssueDataQualityWarning[],
): string | null {
  const normalized = optionalString(value, "action_route", rowIndex, warnings);
  if (normalized === null) return null;
  if (!normalized.startsWith("/")) {
    warnings.push({ code: "optional-field-unavailable", field: "action_route", rowIndex });
    return null;
  }
  return normalized;
}

function pullRequestUrl(
  value: unknown,
  rowIndex: number,
  warnings: IssueDataQualityWarning[],
): string | null {
  const normalized = optionalString(value, "pr_url", rowIndex, warnings);
  if (normalized === null) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString();
  } catch {
    // handled below as an unavailable optional field
  }
  warnings.push({ code: "optional-field-unavailable", field: "pr_url", rowIndex });
  return null;
}

function timestamp(
  value: unknown,
  rowIndex: number,
  warnings: IssueDataQualityWarning[],
): string | null {
  const normalized = optionalString(value, "updated_at", rowIndex, warnings);
  if (normalized === null) return null;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    warnings.push({ code: "optional-field-unavailable", field: "updated_at", rowIndex });
    return null;
  }
  return parsed.toISOString();
}
