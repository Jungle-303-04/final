import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import type { StatusTone } from "./statusTone";

export type TintChipTone = "neutral" | "primary" | StatusTone;

const toneClasses: Readonly<Record<TintChipTone, string>> = {
  neutral: "border-border-subtle bg-muted/60 text-muted-foreground",
  primary: "border-primary/25 bg-primary/8 text-primary",
  healthy:
    "border-status-healthy/30 bg-status-healthy/8 text-status-healthy",
  warning:
    "border-status-warning/35 bg-status-warning/10 text-warning-foreground",
  critical:
    "border-status-critical/35 bg-status-critical/10 text-status-critical",
  stale: "border-status-stale/30 bg-status-stale/8 text-status-stale",
  unknown:
    "border-status-unknown/30 bg-status-unknown/8 text-muted-foreground",
};

export interface TintChipProps {
  className?: string;
  icon?: ReactNode;
  label: ReactNode;
  tone?: TintChipTone;
}

export function TintChip({
  className,
  icon,
  label,
  tone = "neutral",
}: TintChipProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1",
        "text-caption font-semibold leading-none",
        toneClasses[tone],
        className,
      )}
      data-slot="tint-chip"
      data-tone={tone}
    >
      {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
