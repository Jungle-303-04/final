import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import type { StatusTone } from "./statusTone";

export type TintChipTone = "neutral" | "primary" | StatusTone;

const toneClasses: Readonly<Record<TintChipTone, string>> = {
  neutral: "border-tint-gray-border bg-tint-gray-bg text-tint-gray-fg",
  primary: "border-tint-blue-border bg-tint-blue-bg text-tint-blue-fg",
  healthy: "border-tint-ok-border bg-tint-ok-bg text-tint-ok-fg",
  warning: "border-tint-warn-border bg-tint-warn-bg text-tint-warn-fg",
  critical: "border-tint-crit-border bg-tint-crit-bg text-tint-crit-fg",
  stale: "border-tint-purple-border bg-tint-purple-bg text-tint-purple-fg",
  unknown: "border-tint-gray-border bg-tint-gray-bg text-tint-gray-fg",
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
