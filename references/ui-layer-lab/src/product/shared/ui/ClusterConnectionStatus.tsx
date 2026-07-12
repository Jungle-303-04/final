import { StatusMark, type StatusTone } from "./StatusMark";
import { Button } from "./primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./primitives/tooltip";

export type ClusterConnectionState = "online" | "stale" | "pending" | "offline" | "unknown";

export function ClusterConnectionStatus({
  connectionState,
  lastObservedAt,
}: {
  connectionState: ClusterConnectionState;
  lastObservedAt: string | null;
}) {
  const label = connectionLabel(connectionState);
  const observation = formatObservation(lastObservedAt);
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            aria-label={`${label} · 마지막 관측 ${observation}`}
            size="sm"
            type="button"
            variant="ghost"
          />
        )}
      >
        <StatusMark label={label} tone={connectionTone(connectionState)} />
      </TooltipTrigger>
      <TooltipContent side="bottom">마지막 관측 {observation}</TooltipContent>
    </Tooltip>
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

function connectionLabel(state: ClusterConnectionState) {
  const labels: Record<ClusterConnectionState, string> = {
    online: "연결됨",
    stale: "관측 지연",
    pending: "연결 확인 중",
    offline: "연결 끊김",
    unknown: "연결 상태 미확인",
  };
  return labels[state];
}

function formatObservation(value: string | null) {
  if (!value) return "알 수 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
