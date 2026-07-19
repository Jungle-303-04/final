import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n";
import { statusLabelKeys, type StatusTone } from "./statusTone";

const toneClasses: Readonly<Record<StatusTone, string>> = {
  healthy: "border-tint-ok-border bg-tint-ok-bg text-tint-ok-fg",
  warning: "border-tint-warn-border bg-tint-warn-bg text-tint-warn-fg",
  critical: "border-tint-crit-border bg-tint-crit-bg text-tint-crit-fg",
  stale: "border-tint-purple-border bg-tint-purple-bg text-tint-purple-fg",
  unknown: "border-tint-gray-border bg-tint-gray-bg text-tint-gray-fg",
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
