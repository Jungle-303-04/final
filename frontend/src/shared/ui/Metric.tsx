import { cn } from "@/shared/lib/cn";
import { useI18n } from "../i18n";

export type MetricTone = "neutral" | "critical" | "warning";
export type MetricValue = string | number | null;

export interface MetricProps {
  label: string;
  note?: string;
  tone?: MetricTone;
  unavailableLabel?: string;
  unit?: string;
  value: MetricValue;
}

export function Metric({
  label,
  value,
  tone = "neutral",
  note,
  unit,
  unavailableLabel,
}: MetricProps) {
  const { t } = useI18n();
  const unavailable = unavailableLabel?.trim() || t("common.state.unavailable");

  return (
    <dl className="grid min-w-0 gap-1 p-4" data-slot="metric" data-tone={tone}>
      <dt className="truncate text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="m-0 flex min-w-0 items-baseline gap-1">
        {value === null ? (
          <span className="text-sm font-medium text-muted-foreground">{unavailable}</span>
        ) : (
          <>
            <strong className={cn(
              "min-w-0 font-mono text-xl font-semibold tracking-tight",
              tone === "critical" && "text-destructive",
              tone === "warning" && "text-status-warning",
            )}>
              {value}
            </strong>
            {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
          </>
        )}
      </dd>
      {note ? <dd className="m-0 text-xs text-muted-foreground">{note}</dd> : null}
    </dl>
  );
}
