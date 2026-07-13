import { StatusMark, type StatusTone } from "./StatusMark";
import { Button } from "./primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./primitives/tooltip";
import { useI18n, type MessageKey } from "../i18n";

export type ClusterConnectionState = "online" | "stale" | "pending" | "offline" | "unknown";

export function ClusterConnectionStatus({
  connectionState,
  lastObservedAt,
}: {
  connectionState: ClusterConnectionState;
  lastObservedAt: string | null;
}) {
  const { formatDate, t } = useI18n();
  const label = t(connectionLabelKey(connectionState));
  const observation = formatClusterObservation(
    lastObservedAt,
    formatDate,
    t("common.state.unknown"),
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            aria-label={t("home.connection.aria", { status: label, time: observation })}
            className="w-(--product-toolbar-compact-control-width) min-w-0 justify-start"
            size="sm"
            type="button"
            variant="ghost"
          />
        )}
      >
        <StatusMark label={label} tone={connectionTone(connectionState)} />
      </TooltipTrigger>
      <TooltipContent side="bottom">{t("home.lastObserved", { time: observation })}</TooltipContent>
    </Tooltip>
  );
}

export function ClusterConnectionMark({
  connectionState,
}: {
  connectionState: ClusterConnectionState;
}) {
  const { t } = useI18n();
  return (
    <StatusMark
      label={t(connectionLabelKey(connectionState))}
      tone={connectionTone(connectionState)}
    />
  );
}

export function clusterDisplayLabel(cluster: {
  environment: string;
  id: string;
  name: string;
}) {
  return [...new Set([cluster.name, cluster.environment, cluster.id].filter(Boolean))].join(" · ");
}

function connectionTone(state: ClusterConnectionState): StatusTone {
  const tones: Record<ClusterConnectionState, StatusTone> = {
    online: "healthy",
    stale: "stale",
    pending: "warning",
    offline: "critical",
    unknown: "unknown",
  };
  return tones[state];
}

const connectionLabelKeys: Record<ClusterConnectionState, MessageKey> = {
  online: "home.connection.online",
  stale: "home.connection.stale",
  pending: "home.connection.pending",
  offline: "home.connection.offline",
  unknown: "home.connection.unknown",
};

export function connectionLabelKey(state: ClusterConnectionState): MessageKey {
  return connectionLabelKeys[state];
}

export function formatClusterObservation(
  value: string | null,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
  unknownLabel: string,
) {
  if (!value) return unknownLabel;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return unknownLabel;
  return formatDate(timestamp, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
