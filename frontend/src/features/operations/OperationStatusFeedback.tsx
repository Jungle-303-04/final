import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { StatusMark } from "../../shared/ui/StatusMark";
import {
  useOperationStatus,
} from "./OperationStatusStore";
import { OperationReobserveButton } from "./OperationReobserveButton";
import {
  canReobserveOperation,
  operationStatusKeys,
  operationStatusTone,
} from "./operationPresentation";

export function OperationStatusFeedback({
  commandId,
  correlationId,
}: {
  commandId: string;
  correlationId: string;
}) {
  const { t } = useI18n();
  const snapshot = useOperationStatus(commandId);
  const reducedMotion = usePrefersReducedMotion();
  const statusLabel = t(operationStatusKeys[snapshot.status]);
  const reobservable = canReobserveOperation(snapshot.status);
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
      <StatusMark label={statusLabel} tone={operationStatusTone(snapshot.status)} />
      <span className="min-w-0 truncate">
        {t("resources.detail.action.accepted", { id: correlationId })}
        {" · "}
        {t("resources.detail.action.observation", { status: statusLabel })}
      </span>
      <OperationReobserveButton commandId={commandId} enabled={reobservable} />
    </div>
  );
}
