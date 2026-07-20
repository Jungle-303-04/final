import { serializeRouteSearch } from "../filters/routeSearchAdapter";
import type { IssueSummary } from "./issuesContract";
import {
  isResolvedIssue,
  issueSeverityTone,
  issueStatusTone,
} from "./issuePresentation";

export type IssueSeverityFilter = "all" | "critical" | "warning" | "healthy" | "unknown";
export type RecoveryBadgeTone = "active" | "approval" | "completed" | "failed";

export function normalizeSeverityFilter(value: string | null): IssueSeverityFilter {
  if (value === "critical" || value === "warning" || value === "healthy" || value === "unknown") {
    return value;
  }
  return "all";
}

export function sortIssuesByUpdatedAt(issues: readonly IssueSummary[]): IssueSummary[] {
  return issues
    .map((issue, index) => ({
      issue,
      index,
      risk: issueRiskRank(issue),
      time: issueTime(issue.updatedAt),
    }))
    .sort((left, right) => {
      if (left.time !== right.time) return right.time - left.time;
      if (left.risk !== right.risk) return left.risk - right.risk;
      return left.index - right.index;
    })
    .map(({ issue }) => issue);
}

export function filterIssuesBySeverity(
  issues: readonly IssueSummary[],
  filter: IssueSeverityFilter,
): IssueSummary[] {
  if (filter === "all") return [...issues];
  return issues.filter((issue) => issueSeverityFilterValue(issue) === filter);
}

export function issueCardDate(value: string, auditTime: (value: string) => string): string {
  return auditTime(value);
}

export function issueRecoveryProgressSummary(
  issue: IssueSummary,
): { state: RecoveryBadgeTone; step: number } | null {
  const status = normalizeRecoverySignal(issue.status);
  const subject = normalizeRecoverySignal(issue.currentSubject);
  if (
    status === "command_rejected" ||
    status === "pr_failed" ||
    subject === "command.rejected" ||
    subject === "safe_pr.failed" ||
    subject === "workflow.failed"
  ) {
    return { state: "failed", step: 3 };
  }
  if (
    status === "incident_resolved" ||
    status === "resolved" ||
    subject === "incident.resolved"
  ) {
    return { state: "completed", step: 5 };
  }
  if (
    [
      "command_completed",
      "pr_requested",
      "pr_patch_prepared",
      "pr_diff_explained",
      "pr_ready_for_creation",
      "pr_created",
    ].includes(status) ||
    [
      "command.completed",
      "safe_pr.requested",
      "safe_pr.patch_prepared",
      "safe_pr.ready_for_creation",
      "safe_pr.created",
    ].includes(subject)
  ) {
    return { state: "active", step: 4 };
  }
  if (
    ["command_requested", "command_dispatched", "command_queued"].includes(status) ||
    ["command.requested", "command.dispatched", "command.queued_for_agent"].includes(subject)
  ) {
    return { state: "active", step: 3 };
  }
  if (
    issue.commandId !== null ||
    issue.pullRequestUrl !== null ||
    subject === "recovery.action_selected" ||
    status.includes("selected")
  ) {
    return { state: "active", step: 2 };
  }
  if (!isResolvedIssue(issue.status)) {
    return { state: "approval", step: 1 };
  }
  return null;
}

export function namespaceHref(issue: IssueSummary): string | null {
  if (!issue.clusterId || !issue.namespace) return null;
  return `/resources${serializeRouteSearch([
    ["clusters", issue.clusterId],
    ["namespaces", `${issue.clusterId}/${issue.namespace}`],
  ])}`;
}

export function resourceHref(issue: IssueSummary): string | null {
  if (!issue.clusterId || !issue.resourceKind || !issue.resourceName) return namespaceHref(issue);
  const namespace = issue.namespace?.trim() || "~";
  return `/resources${serializeRouteSearch([
    ["clusters", issue.clusterId],
    ["resources.types", issue.resourceKind.toLowerCase()],
    ["detail", `${issue.resourceKind}/${namespace}/${issue.resourceName}`],
  ])}`;
}

export function crashLoopSymptomText(title: string): string {
  return title.trim().toLowerCase() === "crashloopbackoff"
    ? title
    : title;
}

function issueSeverityFilterValue(issue: IssueSummary): Exclude<IssueSeverityFilter, "all"> {
  const tone = issueSeverityTone(issue.severity) ?? issueStatusTone(issue.status);
  if (tone === "critical") return "critical";
  if (tone === "warning") return "warning";
  if (tone === "healthy") return "healthy";
  return "unknown";
}

function issueRiskRank(issue: IssueSummary): number {
  const severity = issueSeverityFilterValue(issue);
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  if (severity === "healthy") return 2;
  return 3;
}

function issueTime(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function normalizeRecoverySignal(value: string): string {
  return value.trim().toLowerCase();
}
