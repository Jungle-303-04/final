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
  const result = operationResult(snapshot.event?.payload);
  const partialFailure = snapshot.status === "completed" && result?.partial_failure === true;
  const statusLabel = partialFailure
    ? t("resources.detail.action.observation.completedWithWarnings")
    : t(operationStatusKeys[snapshot.status]);
  const reobservable = canReobserveOperation(snapshot.status);
  const active = snapshot.status === "connecting" || snapshot.status === "reconnecting";
  const resources = operationResources(result);

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
      data-status={partialFailure ? "completed-with-warnings" : snapshot.status}
      role="status"
    >
      <StatusMark
        label={statusLabel}
        tone={partialFailure ? "warning" : operationStatusTone(snapshot.status)}
      />
      <span className="min-w-0 truncate">
        {t("resources.detail.action.accepted", { id: correlationId })}
        {" · "}
        {t("resources.detail.action.observation", { status: statusLabel })}
      </span>
      <OperationReobserveButton commandId={commandId} enabled={reobservable} />
      {partialFailure && result ? (
        <div className="w-full rounded-md border border-status-warning/40 bg-status-warning/5 p-2">
          <p className="font-medium text-foreground">
            {t("resources.detail.action.result.summary", {
              evicted: boundedCount(result.evicted),
              failed: boundedCount(result.failed),
              skipped: boundedCount(result.skipped),
            })}
          </p>
          {resources.length > 0 ? (
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto font-mono">
              {resources.map((resource, index) => (
                <li key={`${resource.namespace}/${resource.name}/${index}`}>
                  {operationResourceLabel(resource)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const MAX_VISIBLE_OPERATION_RESOURCES = 20;

function operationResult(payload: Readonly<Record<string, unknown>> | undefined) {
  const result = payload?.result;
  return result && typeof result === "object" && !Array.isArray(result)
    ? result as Readonly<Record<string, unknown>>
    : null;
}

function operationResources(
  result: Readonly<Record<string, unknown>> | null,
): Array<Readonly<Record<string, unknown>>> {
  return Array.isArray(result?.resources)
    ? result.resources
        .filter((item): item is Readonly<Record<string, unknown>> => (
          item !== null && typeof item === "object" && !Array.isArray(item)
        ))
        .slice(0, MAX_VISIBLE_OPERATION_RESOURCES)
    : [];
}

function boundedCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function operationResourceLabel(resource: Readonly<Record<string, unknown>>): string {
  const namespace = typeof resource.namespace === "string" && resource.namespace
    ? `${resource.namespace}/`
    : "";
  const name = typeof resource.name === "string" && resource.name
    ? resource.name
    : "unknown";
  const outcome = ["status", "reason", "error"]
    .map((key) => resource[key])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" · ");
  return outcome ? `${namespace}${name} · ${outcome}` : `${namespace}${name}`;
}
