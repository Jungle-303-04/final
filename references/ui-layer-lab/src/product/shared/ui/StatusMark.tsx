import { cn } from "./primitives/cn";

export type StatusTone = "healthy" | "warning" | "critical" | "stale" | "unknown";

const defaultStatusLabel: Record<StatusTone, string> = {
  healthy: "정상",
  warning: "주의",
  critical: "위험",
  stale: "오래된 데이터",
  unknown: "알 수 없음",
};

export interface StatusMarkProps {
  label?: string;
  live?: boolean;
  tone: StatusTone;
}

export function StatusMark({ tone, label, live = false }: StatusMarkProps) {
  const visibleLabel = label?.trim() || defaultStatusLabel[tone];

  return (
    <span
      aria-atomic={live || undefined}
      aria-live={live ? "polite" : undefined}
      className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground"
      data-slot="status-mark"
      data-status={tone}
      role={live ? "status" : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full bg-status-unknown forced-colors:border forced-colors:border-current forced-colors:bg-transparent",
          tone === "healthy" && "bg-status-healthy",
          tone === "warning" && "bg-status-warning",
          tone === "critical" && "bg-destructive",
          tone === "stale" && "bg-status-stale",
        )}
      />
      <span>{visibleLabel}</span>
    </span>
  );
}
