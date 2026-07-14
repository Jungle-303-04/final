import { Check, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { msToNextFreshnessBucket } from "./freshnessTime";
import { Tooltip, TooltipContent, TooltipTrigger } from "./primitives/tooltip";
import { useRefreshAnimation } from "./useRefreshAnimation";

export type FreshnessMode = "polling" | "snapshot";
export type FreshnessConnection = "connected" | "disconnected" | "connecting";

export interface FreshnessCopy {
  polling: string;
  pollingDescription: string;
  paused: string;
  pausedDescription: string;
  reconnecting: string;
  reconnectingDescription: string;
  refreshNow: string;
  updated(elapsedMilliseconds: number): string;
  updatedAt(timestamp: number): string;
}

export interface FreshnessControlProps {
  className?: string;
  connectionState?: FreshnessConnection;
  copy: FreshnessCopy;
  dataUpdatedAt?: number;
  isFetching?: boolean;
  mode: FreshnessMode;
  onRefresh?: () => void | Promise<unknown>;
  paused?: boolean;
}

export function FreshnessControl({
  className,
  connectionState = "connected",
  copy,
  dataUpdatedAt,
  isFetching = false,
  mode,
  onRefresh,
  paused = false,
}: FreshnessControlProps) {
  const [, renderNextBucket] = useState(0);
  const showAge = typeof dataUpdatedAt === "number" && dataUpdatedAt > 0;

  useEffect(() => {
    if (!showAge) return;
    let timer = 0;
    const schedule = () => {
      const elapsed = Date.now() - dataUpdatedAt;
      timer = window.setTimeout(
        () => {
          renderNextBucket((value) => value + 1);
          schedule();
        },
        Math.max(1_000, msToNextFreshnessBucket(elapsed)),
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [dataUpdatedAt, showAge]);

  const { phase, refresh } = useRefreshAnimation(() => onRefresh?.());
  const presentation = freshnessPresentation({
    connectionState,
    copy,
    dataUpdatedAt: showAge ? dataUpdatedAt : undefined,
    mode,
    paused,
  });
  const spinning = isFetching || phase === "spinning";

  return (
    <div
      className={cn("flex items-center gap-1.5 whitespace-nowrap", className)}
      data-slot="freshness-control"
    >
      {presentation.label ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="flex items-center gap-1 text-xs text-muted-foreground" />
            }
          >
            {presentation.tone ? (
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  presentation.tone === "active" ? "bg-success" : "bg-warning",
                )}
              />
            ) : null}
            <span className="tabular-nums">{presentation.label}</span>
            {presentation.age ? (
              <span className="tabular-nums text-muted-foreground/70">
                · {presentation.age}
              </span>
            ) : null}
          </TooltipTrigger>
          {presentation.tooltip ? (
            <TooltipContent side="bottom">
              {presentation.tooltip}
            </TooltipContent>
          ) : null}
        </Tooltip>
      ) : null}
      {onRefresh ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                aria-label={copy.refreshNow}
                className="rounded-lg p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
                disabled={phase === "spinning"}
                onClick={refresh}
                type="button"
              />
            }
          >
            {phase === "success" ? (
              <Check aria-hidden="true" className="size-3.5 text-success" />
            ) : (
              <RefreshCw
                aria-hidden="true"
                className={cn(
                  "size-3.5",
                  spinning && "motion-safe:animate-spin",
                )}
              />
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom">{copy.refreshNow}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

interface FreshnessPresentation {
  age: string | null;
  label: string | null;
  tone: "active" | "paused" | null;
  tooltip: string | null;
}

function freshnessPresentation({
  connectionState,
  copy,
  dataUpdatedAt,
  mode,
  paused,
}: Pick<
  FreshnessControlProps,
  "connectionState" | "copy" | "dataUpdatedAt" | "mode" | "paused"
>): FreshnessPresentation {
  const age = dataUpdatedAt
    ? copy.updated(Math.max(0, Date.now() - dataUpdatedAt))
    : null;
  const exact = dataUpdatedAt ? copy.updatedAt(dataUpdatedAt) : null;
  if (connectionState !== "connected") {
    return {
      age,
      label: copy.reconnecting,
      tone: null,
      tooltip: copy.reconnectingDescription,
    };
  }
  if (mode === "polling" && paused) {
    return {
      age,
      label: copy.paused,
      tone: "paused",
      tooltip: copy.pausedDescription,
    };
  }
  if (mode === "polling") {
    return {
      age,
      label: copy.polling,
      tone: "active",
      tooltip: exact ?? copy.pollingDescription,
    };
  }
  return { age: null, label: age, tone: null, tooltip: exact };
}
