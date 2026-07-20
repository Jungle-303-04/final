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
const COMPLETED_STATUSES = new Set([
  "command_completed",
  "incident_resolved",
  "pr_created",
  "resolved",
]);
const VERIFYING_STATUSES = new Set([
  "pr_requested",
  "pr_patch_prepared",
  "pr_diff_explained",
  "pr_ready_for_creation",
]);
const EXECUTING_STATUSES = new Set([
  "command_requested",
  "command_dispatched",
  "command_queued",
]);

const FAILED_SUBJECTS = new Set([
  "approval.rejected",
  "command.rejected",
  "safe_pr.failed",
  "workflow.run.failed",
]);
const COMPLETED_SUBJECTS = new Set([
  "command.completed",
  "safe_pr.created",
  "workflow.run.completed",
]);
const VERIFYING_SUBJECTS = new Set([
  "safe_pr.requested",
  "safe_pr.patch_prepared",
  "safe_pr.ready_for_creation",
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
  const latestEvent = events[events.length - 1] ?? null;
  const latestSubject = normalize(latestEvent?.subject ?? "");

  if (
    selectionFailed || FAILED_STATUSES.has(status) || FAILED_SUBJECTS.has(subject) ||
    FAILED_SUBJECTS.has(latestSubject)
  ) {
    return phase("failed", failureStep(status, subject, latestSubject), latestEvent);
  }
  if (
    COMPLETED_STATUSES.has(status) || COMPLETED_SUBJECTS.has(subject) ||
    COMPLETED_SUBJECTS.has(latestSubject)
  ) {
    return phase("completed", 4, latestEvent);
  }
  if (
    VERIFYING_STATUSES.has(status) || VERIFYING_SUBJECTS.has(subject) ||
    VERIFYING_SUBJECTS.has(latestSubject)
  ) {
    return phase("verifying", 3, latestEvent);
  }
  if (
    EXECUTING_STATUSES.has(status) || EXECUTING_SUBJECTS.has(subject) ||
    EXECUTING_SUBJECTS.has(latestSubject)
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

export function recoveryStatusIsTerminal(status: string): boolean {
  const normalized = normalize(status);
  return COMPLETED_STATUSES.has(normalized) || FAILED_STATUSES.has(normalized);
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
  latestSubject: string,
): number {
  if (
    status === "pr_failed" || subject === "safe_pr.failed" || subject === "workflow.run.failed" ||
    latestSubject === "safe_pr.failed" || latestSubject === "workflow.run.failed"
  ) return 3;
  if (
    status === "command_rejected" || subject === "command.rejected" ||
    latestSubject === "command.rejected"
  ) return 2;
  return 1;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
