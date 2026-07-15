import type { IssueAuditTimelinePage, IssueSummary } from "./issuesContract";
import type { IssueRecoveryPlan, IssueRecoveryReceipt } from "./issuesRecoveryContract";

export type IssueRecoveryProgressPhase =
  | "approval"
  | "submitting"
  | "executing"
  | "verifying"
  | "completed"
  | "failed";

export interface IssueRecoveryProgress {
  phase: IssueRecoveryProgressPhase;
  progress: number;
  activeStep: number;
  latestEvent: IssueAuditTimelinePage["items"][number] | null;
}

const FAILED_STATUSES = new Set(["command_rejected", "pr_failed"]);
const COMPLETED_STATUSES = new Set(["incident_resolved", "resolved"]);
const VERIFYING_STATUSES = new Set([
  "command_completed",
  "pr_requested",
  "pr_patch_prepared",
  "pr_diff_explained",
  "pr_ready_for_creation",
  "pr_created",
]);
const EXECUTING_STATUSES = new Set([
  "command_requested",
  "command_dispatched",
  "command_queued",
]);

const FAILED_SUBJECTS = new Set([
  "command.rejected",
  "safe_pr.failed",
  "workflow.failed",
]);
const COMPLETED_SUBJECTS = new Set(["incident.resolved"]);
const VERIFYING_SUBJECTS = new Set([
  "command.completed",
  "safe_pr.requested",
  "safe_pr.patch_prepared",
  "safe_pr.ready_for_creation",
  "safe_pr.created",
]);
const EXECUTING_SUBJECTS = new Set([
  "command.requested",
  "command.dispatched",
  "command.queued_for_agent",
]);

export function issueRecoveryProgress({
  audit,
  plan,
  receipt,
  selected,
  selectionFailed,
  selectionPending,
}: {
  audit: IssueAuditTimelinePage | null;
  plan: IssueRecoveryPlan | null;
  receipt: IssueRecoveryReceipt | null;
  selected: IssueSummary;
  selectionFailed: boolean;
  selectionPending: boolean;
}): IssueRecoveryProgress {
  const status = normalize(selected.status);
  const subject = normalize(selected.currentSubject);
  const events = audit?.items ?? [];
  const latestEvent = events[0] ?? null;

  if (
    selectionFailed || FAILED_STATUSES.has(status) || FAILED_SUBJECTS.has(subject) ||
    events.some((event) => FAILED_SUBJECTS.has(normalize(event.subject)))
  ) {
    return phase("failed", failureStep(status, subject, events), latestEvent);
  }
  if (
    COMPLETED_STATUSES.has(status) || COMPLETED_SUBJECTS.has(subject) ||
    events.some((event) => COMPLETED_SUBJECTS.has(normalize(event.subject)))
  ) {
    return phase("completed", 4, latestEvent);
  }
  if (
    VERIFYING_STATUSES.has(status) || VERIFYING_SUBJECTS.has(subject) ||
    events.some((event) => VERIFYING_SUBJECTS.has(normalize(event.subject)))
  ) {
    return phase("verifying", 3, latestEvent);
  }
  if (
    EXECUTING_STATUSES.has(status) || EXECUTING_SUBJECTS.has(subject) ||
    events.some((event) => EXECUTING_SUBJECTS.has(normalize(event.subject)))
  ) {
    return phase("executing", 2, latestEvent);
  }
  if (
    selectionPending || receipt !== null || plan?.selectedActionId !== null &&
      plan?.selectedActionId !== undefined || normalize(plan?.status ?? "").includes("selected")
  ) {
    return phase("submitting", 1, latestEvent);
  }
  return phase("approval", 0, latestEvent);
}

export function recoveryProgressIsTerminal(progress: IssueRecoveryProgress): boolean {
  return progress.phase === "completed" || progress.phase === "failed";
}

function phase(
  value: IssueRecoveryProgressPhase,
  activeStep: number,
  latestEvent: IssueRecoveryProgress["latestEvent"],
): IssueRecoveryProgress {
  return {
    phase: value,
    progress: (activeStep + 1) * 20,
    activeStep,
    latestEvent,
  };
}

function failureStep(
  status: string,
  subject: string,
  events: IssueAuditTimelinePage["items"],
): number {
  if (
    status === "pr_failed" || subject === "safe_pr.failed" || subject === "workflow.failed" ||
    events.some((event) => {
      const eventSubject = normalize(event.subject);
      return eventSubject === "safe_pr.failed" || eventSubject === "workflow.failed";
    })
  ) return 3;
  if (
    status === "command_rejected" || subject === "command.rejected" ||
    events.some((event) => normalize(event.subject) === "command.rejected")
  ) return 2;
  return 1;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
