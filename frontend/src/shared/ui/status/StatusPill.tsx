import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n";
import { statusLabelKeys, type StatusTone } from "./statusTone";

const toneClasses: Readonly<Record<StatusTone, string>> = {
  healthy:
    "border-status-healthy/35 bg-status-healthy/10 text-status-healthy",
  warning:
    "border-status-warning/40 bg-status-warning/12 text-warning-foreground",
  critical:
    "border-status-critical/40 bg-status-critical/12 text-status-critical",
  stale: "border-status-stale/35 bg-status-stale/10 text-status-stale",
  unknown:
    "border-status-unknown/35 bg-status-unknown/10 text-muted-foreground",
};

const dotClasses: Readonly<Record<StatusTone, string>> = {
  healthy: "bg-status-healthy",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
  stale: "bg-status-stale",
  unknown: "bg-status-unknown",
};

export interface StatusPillProps {
  className?: string;
  label?: string;
  live?: boolean;
  pulse?: boolean;
  tone: StatusTone;
}

export function StatusPill({
  className,
  label,
  live = false,
  pulse = false,
  tone,
}: StatusPillProps) {
  const { t } = useI18n();
  const visibleLabel = label?.trim() || t(statusLabelKeys[tone]);

  return (
    <span
      aria-atomic={live || undefined}
      aria-live={live ? "polite" : undefined}
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5",
        "text-label font-semibold leading-none",
        toneClasses[tone],
        className,
      )}
      data-slot="status-pill"
      data-status={tone}
      role={live ? "status" : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full forced-colors:border forced-colors:border-current forced-colors:bg-transparent",
          dotClasses[tone],
          pulse && tone === "healthy" && "motion-live-dot",
        )}
      />
      <span className="truncate">{visibleLabel}</span>
    </span>
  );
}
