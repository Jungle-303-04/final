import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import type { PhysicalTopologyLiveState } from "./usePhysicalTopologyRealtime";

export function ResourcesLiveStatus({
  state,
}: {
  state: PhysicalTopologyLiveState;
}) {
  const { formatNumber, t } = useI18n();
  if (state.status === "idle") return null;
  const degraded = degradedMessage(state.degradedReason);
  const connected = state.status === "connected";
  const label = connected
    ? state.actualIntervalSeconds === null
      ? t("resources.live.connectedUnknown")
      : t("resources.live.connected", {
          seconds: formatNumber(displayInterval(state.actualIntervalSeconds), {
            maximumFractionDigits: 1,
          }),
        })
    : t(`resources.live.${state.status}`);
  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs"
      data-slot="resources-live-status"
      data-state={state.status}
      role="status"
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            connected && degraded === null && "bg-success",
            connected && degraded !== null && "bg-warning",
            (state.status === "connecting" || state.status === "reconnecting") &&
              "animate-pulse bg-warning motion-reduce:animate-none",
            state.status === "disconnected" && "bg-destructive",
          )}
        />
        <span className="tabular-nums">{label}</span>
      </span>
      {degraded === null ? null : (
        <span className="max-w-full truncate text-warning" title={t(degraded)}>
          {t(degraded)}
        </span>
      )}
    </div>
  );
}

function displayInterval(seconds: number): number {
  return seconds < 10 ? Math.round(seconds * 10) / 10 : Math.round(seconds);
}

function degradedMessage(reason: string | null) {
  if (reason === null) return null;
  if (
    reason.includes("forbidden") ||
    reason.includes("unauthorized") ||
    reason.includes("metrics_server_fallback")
  ) return "resources.live.degraded.fallback" as const;
  if (reason.includes("partial") || reason.includes("missing")) {
    return "resources.live.degraded.partial" as const;
  }
  return "resources.live.degraded.unavailable" as const;
}
