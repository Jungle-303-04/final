import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { LiveStatusDot, type LiveStatusDotTone } from "../../shared/ui/LiveStatusDot";
import type { PhysicalTopologyLiveState } from "./usePhysicalTopologyRealtime";

export function ResourcesLiveStatus({
  state,
}: {
  state: PhysicalTopologyLiveState;
}) {
  const { formatDate, formatNumber, t } = useI18n();
  if (state.status === "idle") return null;
  const degraded = degradedMessage(state.degradedReason);
  const connected = state.status === "connected";
  const updatedAt = state.updatedAt > 0 ? state.updatedAt : 0;
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
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center justify-end gap-x-2 text-xs"
      data-slot="resources-live-status"
      data-state={state.status}
      data-updated-at={state.updatedAt > 0 ? state.updatedAt : undefined}
      role="status"
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
        <LiveStatusDot state={state.status} tone={liveStatusTone(state.status, degraded !== null)} />
        <span className="tabular-nums">{label}</span>
      </span>
      <span
        aria-hidden={degraded === null || undefined}
        className={cn(
          "min-w-0 truncate text-right text-warning",
          degraded === null && "invisible",
        )}
        data-slot="resources-live-degraded"
        title={degraded === null ? undefined : t(degraded)}
      >
        {t(degraded ?? "resources.live.degraded.unavailable")}
      </span>
      <span
        aria-hidden={state.updatedAt <= 0 || undefined}
        className={cn(
          "whitespace-nowrap tabular-nums text-muted-foreground",
          state.updatedAt <= 0 && "invisible",
        )}
        data-slot="resources-live-updated"
        title={state.updatedAt > 0
          ? formatDate(updatedAt, { dateStyle: "medium", timeStyle: "medium" })
          : undefined}
      >
        {t("resources.table.updated")} {formatDate(updatedAt, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
    </div>
  );
}

function liveStatusTone(
  state: PhysicalTopologyLiveState["status"],
  degraded: boolean,
): LiveStatusDotTone {
  if (state === "connected") return degraded ? "warning" : "healthy";
  if (state === "connecting" || state === "reconnecting") return "warning";
  if (state === "disconnected") return "critical";
  return "unknown";
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
