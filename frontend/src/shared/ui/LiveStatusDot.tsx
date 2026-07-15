import { cn } from "../lib/cn";

export type LiveStatusDotState =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected"
  | "closed";

export type LiveStatusDotTone = "healthy" | "warning" | "critical" | "stale" | "unknown";

export function LiveStatusDot({
  state,
  tone,
}: {
  state: LiveStatusDotState;
  tone: LiveStatusDotTone;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full bg-status-unknown transition-colors motion-reduce:transition-none",
        tone === "healthy" && "bg-status-healthy",
        tone === "warning" && "bg-status-warning",
        tone === "critical" && "bg-destructive",
        tone === "stale" && "bg-status-stale",
      )}
      data-state={state}
      data-slot="live-status-dot"
    />
  );
}
