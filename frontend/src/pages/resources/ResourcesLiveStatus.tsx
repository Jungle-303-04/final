import { useI18n } from "../../shared/i18n";
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
      data-updated-at={state.updatedAt > 0 ? state.updatedAt : undefined}
      role="status"
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
        <LiveStatusDot state={state.status} tone={liveStatusTone(state.status, degraded !== null)} />
        <span className="tabular-nums">{label}</span>
      </span>
      {degraded === null ? null : (
        <span className="max-w-full truncate text-warning" title={t(degraded)}>
          {t(degraded)}
        </span>
      )}
      {state.updatedAt > 0 ? (
        <span
          className="whitespace-nowrap tabular-nums text-muted-foreground"
          title={formatDate(state.updatedAt, { dateStyle: "medium", timeStyle: "medium" })}
        >
          {t("resources.table.updated")} {formatDate(state.updatedAt, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      ) : null}
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
