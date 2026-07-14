import {
  Bell,
  CirclePause,
  CirclePlay,
  FastForward,
  RotateCcw,
  Undo2,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ReleaseRun, ReleaseRunAction } from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";

export function RunActions({
  run,
  pending,
  onAction,
}: {
  run: ReleaseRun;
  pending: boolean;
  onAction: (run: ReleaseRun, action: ReleaseRunAction) => void;
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
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {actionsForStatus(run.status).map((action) => {
        const Icon = icon[action];
        const dangerous = action === "rollback" || action === "cancel";
        return (
          <Button
            disabled={pending}
            key={action}
            onClick={() => {
              if (!dangerous || window.confirm(t("workflows.runs.confirmDanger"))) onAction(run, action);
            }}
            size="sm"
            variant={dangerous ? "destructive" : "outline"}
          >
            <Icon aria-hidden="true" />
            {t(`workflows.runs.action.${action}`)}
          </Button>
        );
      })}
    </div>
  );
}

export function RunFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2 bg-card p-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <div className="grid min-w-0 gap-0.5">
        <dt className="text-[0.6875rem] text-muted-foreground">{label}</dt>
        <dd className="m-0 text-xs font-medium [overflow-wrap:anywhere]">{value}</dd>
      </div>
    </div>
  );
}

export function RunStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const normalized = status.toLowerCase();
  const variant = ["failed", "error", "cancelled"].includes(normalized)
    ? "destructive"
    : ["succeeded", "success", "completed"].includes(normalized)
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
  const normalized = status.toLowerCase();
  if (["succeeded", "success", "completed"].includes(normalized)) return t("workflows.status.succeeded");
  if (["failed", "error"].includes(normalized)) return t("workflows.status.failed");
  if (normalized === "cancelled") return t("workflows.status.cancelled");
  if (normalized === "waiting_for_approval") return t("workflows.status.waitingApproval");
  if (["running", "in_progress", "queued"].includes(normalized)) return t("workflows.status.running");
  if (normalized === "paused") return t("workflows.status.paused");
  return t("workflows.status.pending");
}

function actionsForStatus(status: string): ReleaseRunAction[] {
  const normalized = status.toLowerCase();
  if (normalized === "paused") return ["resume", "cancel", "notify"];
  if (["failed", "error"].includes(normalized)) return ["retry", "rollback", "notify"];
  if (["succeeded", "cancelled"].includes(normalized)) return ["notify"];
  return ["advance", "pause", "cancel", "notify"];
}
