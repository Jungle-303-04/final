import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { StatusMark, type StatusTone } from "../../shared/ui/StatusMark";
import { Button } from "../../shared/ui/primitives/button";
import {
  useOperationStatus,
  useOperationStatusStore,
  type OperationStatus,
} from "./OperationStatusStore";

const statusKeys: Record<OperationStatus, MessageKey> = {
  idle: "resources.detail.action.observation.idle",
  connecting: "resources.detail.action.observation.connecting",
  running: "resources.detail.action.observation.running",
  reconnecting: "resources.detail.action.observation.reconnecting",
  completed: "resources.detail.action.observation.completed",
  failed: "resources.detail.action.observation.failed",
  forbidden: "resources.detail.action.observation.forbidden",
  invalid: "resources.detail.action.observation.invalid",
  unavailable: "resources.detail.action.observation.unavailable",
};

export function OperationStatusFeedback({
  commandId,
  correlationId,
}: {
  commandId: string;
  correlationId: string;
}) {
  const { t } = useI18n();
  const store = useOperationStatusStore();
  const snapshot = useOperationStatus(commandId);
  const reducedMotion = usePrefersReducedMotion();
  const statusLabel = t(statusKeys[snapshot.status]);
  const reobservable = snapshot.status === "forbidden"
    || snapshot.status === "invalid"
    || snapshot.status === "unavailable";
  const active = snapshot.status === "connecting" || snapshot.status === "reconnecting";

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground",
        active && !reducedMotion && "motion-safe:animate-pulse",
      )}
      data-reduced-motion={reducedMotion}
      data-slot="operation-status-feedback"
      data-status={snapshot.status}
      role="status"
    >
      <StatusMark label={statusLabel} tone={toneFor(snapshot.status)} />
      <span className="min-w-0 truncate">
        {t("resources.detail.action.accepted", { id: correlationId })}
        {" · "}
        {t("resources.detail.action.observation", { status: statusLabel })}
      </span>
      {reobservable ? (
        <Button
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => store.reobserve(commandId)}
          type="button"
          variant="outline"
        >
          {t("resources.detail.action.reobserve")}
        </Button>
      ) : null}
    </div>
  );
}

function toneFor(status: OperationStatus): StatusTone {
  switch (status) {
    case "completed":
      return "healthy";
    case "connecting":
    case "reconnecting":
    case "idle":
      return "unknown";
    case "running":
    case "invalid":
      return "warning";
    case "unavailable":
      return "stale";
    case "failed":
    case "forbidden":
      return "critical";
  }
}
