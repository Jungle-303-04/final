import type { AuditTimelineItem } from "../api/audit-timeline-schemas";
import type { RecoveryPlan } from "../api/recovery-schemas";

export type RecoveryProgressPhase =
  | "waiting"
  | "approval"
  | "submitting"
  | "executing"
  | "verifying"
  | "blocked"
  | "completed"
  | "failed";

export interface RecoveryProgressState {
  phase: RecoveryProgressPhase;
  label: "복구 대기" | "자동 복구 요청됨" | "PR 생성 요청됨" | "복구 요청됨" | "복구 실행 중" | "검증 중" | "PR 생성됨" | "PR 검토 필요" | "추가 설정 필요" | "복구 완료" | "복구 실패";
  step: number;
  tone: "waiting" | "approval" | "active" | "completed" | "failed";
  latestEvent: AuditTimelineItem | null;
}

export function recoveryDisplayedStep(progress: RecoveryProgressState): number {
  if (progress.phase === "waiting") return 0;
  if (progress.phase === "completed") return 5;
  return Math.min(5, progress.step + 1);
}

export function withCreatedPullRequest(
  progress: RecoveryProgressState,
  prUrl: string | null | undefined,
  label: "PR 생성됨" | "PR 검토 필요",
): RecoveryProgressState {
  if (
    !prUrl?.trim()
    || progress.phase === "completed"
    || progress.phase === "failed"
    || progress.phase === "blocked"
  ) {
    return progress;
  }
  return {
    ...progress,
    phase: "verifying",
    label,
    step: Math.max(progress.step, 3),
    tone: "approval",
  };
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

const FAILED_SUBJECTS = new Set([
  "command.rejected",
  "safe_pr.failed",
  "workflow.failed",
  "workflow.run.failed",
]);
const BLOCKED_SUBJECTS = new Set([
  "rca.action_required",
  "rca.followup.required",
]);
const RETRYABLE_BLOCKER_CODES = new Set([
  "gitops_authority_unavailable",
  "gitops_authority_mismatch",
  "safe_pr_patch_missing",
  "safe_pr_patch_unsupported",
  "safe_pr_preflight_failed",
  "safe_pr_preflight_unavailable",
]);
const COMPLETED_SUBJECTS = new Set(["incident.resolved"]);
const VERIFYING_SUBJECTS = new Set([
  "command.completed",
  "rollout.diagnosed",
  "workflow.run.completed",
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
  const currentAudit = currentRecoveryAttemptAudit(audit);
  const latestEvent = currentAudit[0] ?? null;
  const subjects = currentAudit.map((event) => normalize(event.subject));
  const hasRetryableBlocker = currentAudit.some(isRetryableRecoveryBlocker);

  if (
    (
      BLOCKED_SUBJECTS.has(normalizedSubject)
      && currentAudit.some((event) => normalize(event.subject) === normalizedSubject)
      && hasRetryableBlocker
    )
    || hasRetryableBlocker
  ) {
    return state("blocked", "추가 설정 필요", 1, "failed", latestEvent);
  }
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

function isRetryableRecoveryBlocker(event: AuditTimelineItem): boolean {
  if (!BLOCKED_SUBJECTS.has(normalize(event.subject))) return false;
  const reasonCode = event.payload_summary.reason_code;
  return typeof reasonCode === "string"
    && RETRYABLE_BLOCKER_CODES.has(normalize(reasonCode));
}

export function currentRecoveryAttemptAudit(
  audit: readonly AuditTimelineItem[],
): AuditTimelineItem[] {
  const ordered = [...audit].sort((left, right) => {
    const time = Date.parse(right.created_at) - Date.parse(left.created_at);
    return time || right.event_id.localeCompare(left.event_id);
  });
  const latestSelection = ordered.findIndex((event) =>
    SELECTED_SUBJECTS.has(normalize(event.subject))
  );
  return latestSelection < 0 ? ordered : ordered.slice(0, latestSelection + 1);
}

function failureStep(status: string, subject: string, auditSubjects: readonly string[]): number {
  if (
    status === "pr_failed"
    || subject === "safe_pr.failed"
    || subject === "workflow.failed"
    || auditSubjects.some(
      (value) => value === "safe_pr.failed"
        || value === "workflow.failed"
        || value === "workflow.run.failed",
    )
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
