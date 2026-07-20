import {
  Bell,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  FastForward,
  RotateCcw,
  Undo2,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  ApprovalDecision,
  ReleaseRun,
  ReleaseRunAction,
} from "../../features/gitops/gitOpsContract";
import { workflowRunState } from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";

export function RunActions({
  run,
  pending,
  onAction,
  onApprovalDecision,
}: {
  run: ReleaseRun;
  pending: boolean;
  onAction: (run: ReleaseRun, action: ReleaseRunAction) => void;
  onApprovalDecision: (
    run: ReleaseRun,
    approvalId: string,
    decision: ApprovalDecision,
  ) => void;
}) {
  const { t } = useI18n();
  const icon = {
    advance: FastForward,
    pause: CirclePause,
    resume: CirclePlay,
    retry: RotateCcw,
    rollback: Undo2,
    cancel: XCircle,
    notify: Bell,
  };
  const state = workflowRunState(run.derived_status || run.status);
  const approvalId = state === "waiting_for_approval" ? pendingApprovalId(run) : null;
  const actions = actionsForRun(run);
  const standardActions = actions.filter((action) => action !== "rollback" && action !== "cancel");
  const dangerActions = actions.filter((action) => action === "rollback" || action === "cancel");
  const renderAction = (action: ReleaseRunAction) => {
    const Icon = icon[action];
    const dangerous = action === "rollback" || action === "cancel";
    const primary = action === "advance" || action === "resume" || action === "retry";
    return (
      <Button
        disabled={pending}
        key={action}
        onClick={() => {
          if (!dangerous || window.confirm(t("workflows.runs.confirmDanger"))) onAction(run, action);
        }}
        size="sm"
        variant={dangerous ? "destructive" : primary ? "default" : "outline"}
      >
        <Icon aria-hidden="true" />
        {t(`workflows.runs.action.${action}`)}
      </Button>
    );
  };
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
      {approvalId ? (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <Button
            disabled={pending}
            onClick={() => onApprovalDecision(run, approvalId, "grant")}
            size="sm"
          >
            <CheckCircle2 aria-hidden="true" />
            {t("workflows.runs.action.grant")}
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              if (window.confirm(t("workflows.runs.confirmDanger"))) {
                onApprovalDecision(run, approvalId, "reject");
              }
            }}
            size="sm"
            variant="destructive"
          >
            <XCircle aria-hidden="true" />
            {t("workflows.runs.action.reject")}
          </Button>
        </div>
      ) : state === "waiting_for_approval" ? (
        <span className="text-xs font-medium text-tint-warn-fg" role="status">
          {t("workflows.runs.approvalUnavailable")}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
        {standardActions.map(renderAction)}
      </div>
      {dangerActions.length ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-l pl-1.5">
          {dangerActions.map(renderAction)}
        </div>
      ) : null}
    </div>
  );
}

export function RunFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden bg-card p-3">
      <span className="shrink-0 text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <dt className="shrink-0 text-[0.6875rem] text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 flex-1 border-l pl-2 text-xs font-medium">
        <OverflowIdentity value={value} />
      </dd>
    </div>
  );
}

export function RunStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const state = workflowRunState(status);
  const variant = state === "failed" || state === "rollback_requested" || state === "cancelled"
    ? "destructive"
    : state === "succeeded"
      ? "default"
      : "secondary";
  return <Badge variant={variant}>{statusLabel(status, t)}</Badge>;
}

export function formatRunTime(
  value: string | undefined,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
  fallback: string,
): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? fallback
    : formatDate(parsed, { dateStyle: "medium", timeStyle: "short" });
}

export function shortRunId(value: string): string {
  return value.replace(/^release-run-/u, "").slice(0, 14);
}

type T = ReturnType<typeof useI18n>["t"];

function statusLabel(status: string, t: T): string {
  const state = workflowRunState(status);
  if (state === "succeeded") return t("workflows.status.succeeded");
  if (state === "failed") return t("workflows.status.failed");
  if (state === "rollback_requested") return t("workflows.status.rollbackRequested");
  if (state === "cancelled") return t("workflows.status.cancelled");
  if (state === "waiting_for_approval") return t("workflows.status.waitingApproval");
  if (state === "running") return t("workflows.status.running");
  if (state === "paused") return t("workflows.status.paused");
  return t("workflows.status.pending");
}

function actionsForRun(run: ReleaseRun): ReleaseRunAction[] {
  const state = workflowRunState(run.derived_status || run.status);
  const rollback = rollbackAllowed(run, state) ? ["rollback" as const] : [];
  if (state === "running") return ["advance", "pause", ...rollback, "cancel", "notify"];
  if (state === "paused") return ["resume", ...rollback, "cancel", "notify"];
  if (state === "waiting_for_approval") return [...rollback, "cancel", "notify"];
  if (state === "failed") return ["retry", "notify"];
  if (state === "succeeded" || state === "cancelled" || state === "rollback_requested") {
    return ["notify"];
  }
  return ["cancel", "notify"];
}

function rollbackAllowed(run: ReleaseRun, state: ReturnType<typeof workflowRunState>): boolean {
  return ["running", "paused", "waiting_for_approval"].includes(state)
    && run.settings.rollback_policy !== "disabled";
}

function pendingApprovalId(run: ReleaseRun): string | null {
  const waitingStep = run.steps.find((step) => (
    workflowRunState(step.status) === "waiting_for_approval"
    && typeof step.approval_id === "string"
    && step.approval_id.trim() !== ""
  ));
  return waitingStep?.approval_id?.trim() || null;
}
