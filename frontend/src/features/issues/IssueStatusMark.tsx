import { cn } from "@/shared/lib/cn";
import type { StatusTone } from "../../shared/ui/StatusMark";

export function IssueStatusMark({
  label,
  labelMode = "visible",
  tone,
}: {
  label: string;
  labelMode?: "visible" | "sr-only";
  tone: StatusTone;
}) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground"
      data-status={tone}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full bg-status-unknown forced-colors:border forced-colors:border-current forced-colors:bg-transparent",
          tone === "healthy" && "bg-status-healthy",
          tone === "warning" && "bg-status-warning",
          tone === "critical" && "bg-destructive",
          tone === "stale" && "bg-status-stale",
        )}
      />
      <span className={cn("truncate", labelMode === "sr-only" && "sr-only")}>{label}</span>
    </span>
  );
}
