import { cn } from "./primitives/cn";

export type StatusTone = "healthy" | "warning" | "critical" | "stale" | "unknown";

export function StatusMark({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground" data-status={tone}>
      <span
        className={cn(
          "size-2 rounded-full bg-status-unknown",
          tone === "healthy" && "bg-status-healthy",
          tone === "warning" && "bg-status-warning",
          tone === "critical" && "bg-destructive",
          tone === "stale" && "bg-status-stale",
        )}
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  );
}
