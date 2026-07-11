import { cn } from "./primitives/cn";

export function Metric({ label, value, tone = "neutral", note }: {
  label: string;
  value: string | number;
  tone?: "neutral" | "critical" | "warning";
  note?: string;
}) {
  return (
    <div className="grid min-w-0 gap-1 p-4" data-tone={tone}>
      <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
      <strong className={cn(
        "font-mono text-xl font-semibold tracking-tight",
        tone === "critical" && "text-destructive",
        tone === "warning" && "text-status-warning",
      )}>
        {value}
      </strong>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  );
}
