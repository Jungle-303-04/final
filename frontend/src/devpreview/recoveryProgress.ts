import type { AuditTimelineItem } from "../api/audit-timeline-schemas";
import type { RecoveryPlan } from "../api/recovery-schemas";

export type RecoveryProgressPhase =
  | "waiting"
  | "approval"
  | "submitting"
  | "executing"
  | "verifying"
  | "completed"
  | "failed";

export interface RecoveryProgressState {
  phase: RecoveryProgressPhase;
  label: "복구 대기" | "자동 복구 요청됨" | "PR 생성 요청됨" | "복구 요청됨" | "복구 실행 중" | "검증 중" | "PR 생성됨" | "PR 검토 필요" | "복구 완료" | "복구 실패";
  step: number;
  tone: "waiting" | "approval" | "active" | "completed" | "failed";
  latestEvent: AuditTimelineItem | null;
}

export function recoveryDisplayedStep(progress: RecoveryProgressState): number {
  if (progress.phase === "waiting") return 0;
  if (progress.phase === "completed") return 5;
  return Math.min(5, progress.step + 1);
}

const ANALYSIS_COMPLETED_STATUSES = new Set([
  "rca_completed",
  "followup_required",
  "action_required",
  "recovery_planned",
  "selection_required",
  "recovery_selected",
  "approval_recommended",
]);
const FAILED_STATUSES = new Set(["command_rejected", "pr_failed"]);
const COMPLETED_STATUSES = new Set(["incident_resolved", "resolved", "completed", "closed"]);
const VERIFYING_STATUSES = new Set([
  "command_completed",
  "pr_requested",
  "pr_patch_prepared",
  "pr_diff_explained",
  "pr_ready_for_creation",
  "pr_created",
]);
const EXECUTING_STATUSES = new Set(["command_requested", "command_dispatched", "command_queued"]);
const SELECTED_STATUSES = new Set(["recovery_selected", "approval_recommended"]);

const FAILED_SUBJECTS = new Set(["command.rejected", "safe_pr.failed", "workflow.failed"]);
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
const SELECTED_SUBJECTS = new Set(["recovery.action_selected", "recovery.selected"]);

export function recoveryProgressState({
  status,
  currentSubject,
  plan,
  audit = [],
  actionRoute,
  selectionPending = false,
  selectionAccepted = false,
  selectionFailed = false,
}: {
  status?: string | null;
  currentSubject?: string | null;
  plan?: RecoveryPlan | null;
  audit?: readonly AuditTimelineItem[];
  actionRoute?: string | null;
  selectionPending?: boolean;
  selectionAccepted?: boolean;
  selectionFailed?: boolean;
}): RecoveryProgressState {
  const normalizedStatus = normalize(status);
  const normalizedSubject = normalize(currentSubject);
  const normalizedRoute = normalize(actionRoute);
  const latestEvent = audit[0] ?? null;
  const subjects = audit.map((event) => normalize(event.subject));

  if (
    selectionFailed
    || FAILED_STATUSES.has(normalizedStatus)
    || FAILED_SUBJECTS.has(normalizedSubject)
    || subjects.some((subject) => FAILED_SUBJECTS.has(subject))
  ) {
    return state("failed", "복구 실패", failureStep(normalizedStatus, normalizedSubject, subjects), "failed", latestEvent);
  }
  if (
    COMPLETED_STATUSES.has(normalizedStatus)
    || COMPLETED_SUBJECTS.has(normalizedSubject)
    || subjects.some((subject) => COMPLETED_SUBJECTS.has(subject))
  ) {
    return state("completed", "복구 완료", 5, "completed", latestEvent);
  }
  if (
    VERIFYING_STATUSES.has(normalizedStatus)
    || VERIFYING_SUBJECTS.has(normalizedSubject)
    || subjects.some((subject) => VERIFYING_SUBJECTS.has(subject))
  ) {
    return state("verifying", "검증 중", 3, "active", latestEvent);
  }
  if (
    EXECUTING_STATUSES.has(normalizedStatus)
    || EXECUTING_SUBJECTS.has(normalizedSubject)
    || subjects.some((subject) => EXECUTING_SUBJECTS.has(subject))
  ) {
    return state("executing", "복구 실행 중", 2, "active", latestEvent);
  }
  if (
    selectionPending
    || selectionAccepted
    || plan?.selected_action_id
    || SELECTED_STATUSES.has(normalizedStatus)
    || SELECTED_SUBJECTS.has(normalizedSubject)
    || subjects.some((subject) => SELECTED_SUBJECTS.has(subject))
  ) {
    if (normalizedRoute === "approval_required") {
      return state("submitting", "복구 요청됨", 1, "active", latestEvent);
    }
    if (normalizedRoute === "draft_pr" || normalizedRoute === "safe_pr") {
      return state("submitting", "PR 생성 요청됨", 1, "active", latestEvent);
    }
    if (normalizedRoute === "auto") {
      return state("submitting", "자동 복구 요청됨", 1, "active", latestEvent);
    }
    return state("submitting", "복구 요청됨", 1, "active", latestEvent);
  }
  if (
    plan
    || ANALYSIS_COMPLETED_STATUSES.has(normalizedStatus)
    || normalizedSubject === "recovery_review_required"
  ) {
    return state("waiting", "복구 대기", 0, "waiting", latestEvent);
  }
  return state("waiting", "복구 대기", 0, "waiting", latestEvent);
}

function failureStep(status: string, subject: string, auditSubjects: readonly string[]): number {
  if (
    status === "pr_failed"
    || subject === "safe_pr.failed"
    || subject === "workflow.failed"
    || auditSubjects.some((value) => value === "safe_pr.failed" || value === "workflow.failed")
  ) return 3;
  if (
    status === "command_rejected"
    || subject === "command.rejected"
    || auditSubjects.includes("command.rejected")
  ) return 2;
  return 1;
}

function state(
  phase: RecoveryProgressPhase,
  label: RecoveryProgressState["label"],
  step: number,
  tone: RecoveryProgressState["tone"],
  latestEvent: AuditTimelineItem | null,
): RecoveryProgressState {
  return { phase, label, step, tone, latestEvent };
}

function normalize(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}
