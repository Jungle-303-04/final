import type { RcaIncident } from "../devpreview-surfaces";
import type { AlertEventView } from "./alertsFeed";
import type { RcaIssueDetailView } from "./rcaDetailFeed";
import type { RcaIssueAttemptSummary } from "./rcaIssueGrouping";
import { operationalMessageLabel } from "./statusLabel";

export const ALERT_RCA_POLL_MS = 4000;

export function incidentFromRcaIssue(issue: RcaIssueDetailView): RcaIncident {
  return {
    name: issue.resourceName ?? issue.correlationId.slice(0, 12),
    symptom: issue.symptom ?? issue.status,
    rawSymptom: issue.rawSymptom,
    cluster: issue.clusterId ?? "-",
    svc: issue.resourceName ?? issue.correlationId.slice(0, 12),
    ns: issue.namespace ?? "-",
    resourceKind: issue.resourceKind,
    correlationId: issue.correlationId,
    incidentId: issue.incidentId,
    currentSubject: issue.currentSubject,
    updatedAt: issue.updatedAt,
    status: issue.status,
    severity: issue.severity,
    rootCause: issue.rootCause,
    confidence: issue.confidence,
    supportingEvidence: issue.supportingEvidence,
    missingEvidence: issue.missingEvidence,
    situationSummary: issue.situationSummary,
    recommendedActionSummary: issue.recommendedActionSummary,
    evidenceSummary: issue.evidenceSummary,
    evidenceBundleSummary: issue.evidenceBundleSummary,
    prUrl: issue.prUrl,
  };
}

export function incidentFromRcaIssueAttempt(
  issue: RcaIssueDetailView,
  attempt: RcaIssueAttemptSummary,
): RcaIncident {
  const rawSymptom = attempt.rawSymptom;
  const correlationId = attempt.correlationId;
  return {
    name: attempt.resourceName ?? issue.resourceName ?? correlationId.slice(0, 12),
    symptom: rawSymptom ? operationalMessageLabel(rawSymptom) : attempt.status,
    rawSymptom,
    cluster: attempt.clusterId ?? issue.clusterId ?? "-",
    svc: attempt.resourceName ?? issue.resourceName ?? correlationId.slice(0, 12),
    ns: attempt.namespace ?? issue.namespace ?? "-",
    resourceKind: attempt.resourceKind ?? issue.resourceKind,
    correlationId,
    incidentId: attempt.incidentId,
    currentSubject: attempt.currentSubject,
    updatedAt: attempt.updatedAt,
    status: attempt.status,
    severity: attempt.severity,
    rootCause: attempt.rootCause,
    confidence: attempt.confidence,
    supportingEvidence: attempt.supportingEvidence,
    missingEvidence: attempt.missingEvidence,
    situationSummary: attempt.situationSummary,
    recommendedActionSummary: attempt.recommendedActionSummary,
    evidenceSummary: attempt.evidenceSummary,
    evidenceBundleSummary: attempt.evidenceBundleSummary,
    recoveryReasonCode: attempt.recoveryReasonCode,
    prUrl: attempt.prUrl,
  };
}

export function incidentFromRcaIssueByIncidentId(
  issues: readonly RcaIssueDetailView[],
  incidentId: string,
): RcaIncident | null {
  const direct = issues.find((issue) => issue.incidentId === incidentId);
  if (direct) return incidentFromRcaIssue(direct);
  for (const issue of issues) {
    const attempt = issue.recentAttempts?.find((item) => item.incidentId === incidentId);
    if (attempt) return incidentFromRcaIssueAttempt(issue, attempt);
  }
  return null;
}

/**
 * Open an incident notification immediately, even while the asynchronous RCA
 * projection is still catching up. Every displayed value comes from the alert
 * event; the shell replaces this provisional view when the matching RCA issue
 * arrives.
 */
export function incidentFromAlertEvent(event: AlertEventView): RcaIncident {
  const symptom = event.ruleName?.trim() || event.name;
  return {
    name: event.name,
    symptom: operationalMessageLabel(symptom),
    rawSymptom: symptom,
    cluster: event.cluster,
    svc: event.name,
    ns: event.namespace ?? "-",
    resourceKind: event.kind,
    incidentId: event.incidentId,
    currentSubject: event.status,
    updatedAt: event.firedAt,
    status: event.status,
    severity: event.severity === "critical" || event.severity === "high"
      ? "critical"
      : "warning",
  };
}

export function promoteAlertIncident(
  current: RcaIncident | null,
  issues: readonly RcaIssueDetailView[],
): RcaIncident | null {
  if (!current?.incidentId || current.correlationId) return current;
  return incidentFromRcaIssueByIncidentId(issues, current.incidentId) ?? current;
}

export function alertIncidentPollMs(incident: RcaIncident | null): number {
  return incident?.incidentId && !incident.correlationId ? ALERT_RCA_POLL_MS : 0;
}

export function alertIncidentClusterIds(
  incident: RcaIncident | null,
  _defaultClusterIds: readonly string[],
): readonly string[] {
  return incident?.incidentId && !incident.correlationId && incident.cluster !== "-"
    ? [incident.cluster]
    : [];
}
