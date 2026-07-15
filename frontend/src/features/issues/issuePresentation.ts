import type { StatusTone } from "../../shared/ui/StatusMark";
import type { IssueSummary } from "./issuesContract";

const RESOLVED_STATUS = /(^|[._-])(resolved|closed|completed|recovered|healthy)($|[._-])/i;
const CRITICAL_STATUS = /(^|[._-])(critical|failed|error|crash|blocked)($|[._-])/i;
const ACTIVE_STATUS = /(^|[._-])(open|active|investigating|pending|warning|degraded|waiting)($|[._-])/i;

export function isResolvedIssue(status: string): boolean {
  return RESOLVED_STATUS.test(status.trim());
}

export function issueStatusTone(status: string): StatusTone {
  const normalized = status.trim();
  if (isResolvedIssue(normalized)) return "healthy";
  if (CRITICAL_STATUS.test(normalized)) return "critical";
  if (ACTIVE_STATUS.test(normalized)) return "warning";
  return "unknown";
}

export function issueEvidenceCount(issue: IssueSummary): number | null {
  if (issue.supportingEvidence !== null && issue.supportingEvidence.length > 0) {
    return issue.supportingEvidence.length;
  }
  return issue.evidenceRef === null ? null : 1;
}

export function issueTitle(issue: IssueSummary): string {
  return issue.symptom?.trim() || issue.currentSubject.trim() || issue.correlationId;
}

export function issueResourceLabel(issue: IssueSummary): string | null {
  const kind = issue.resourceKind?.trim() || null;
  const name = issue.resourceName?.trim() || null;
  const namespace = issue.namespace?.trim() || null;
  const coordinate = name === null ? null : namespace ? `${namespace} / ${name}` : name;
  return [kind, coordinate].filter((value): value is string => value !== null).join(" · ") || null;
}
