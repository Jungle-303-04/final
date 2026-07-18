import { cn } from "@/shared/lib/cn";
import { MiniBar } from "./Bars";
import type { ChartTone } from "./chartPrimitives";

export interface RankListItem {
  ariaLabel: string;
  displayValue: string;
  id: string;
  label: string;
  max: number;
  tone?: ChartTone;
  value: null | number;
}

export function RankList({
  ariaLabel,
  className,
  items,
}: {
  ariaLabel: string;
  className?: string;
  items: readonly RankListItem[];
}) {
  return (
    <ol
      aria-label={ariaLabel}
      className={cn("grid min-w-0 gap-2.5", className)}
      data-slot="rank-list"
    >
      {items.map((item, index) => (
        <li className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2" key={item.id}>
          <span className="font-mono text-caption tabular-nums text-caption-foreground">
            {index + 1}
          </span>
          <span className="grid min-w-0 gap-1.5">
            <span className="truncate text-body font-semibold text-foreground">
              {item.label}
            </span>
            <MiniBar
              ariaLabel={item.ariaLabel}
              max={item.max}
              tone={item.tone}
              value={item.value}
            />
          </span>
          <span className="font-mono text-caption tabular-nums text-muted-foreground">
            {item.displayValue}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function SlotMatrix({
  ariaLabel,
  className,
  filled,
  maxVisible = 40,
  tone = "primary",
  total,
}: {
  ariaLabel: string;
  className?: string;
  filled: number;
  maxVisible?: number;
  tone?: ChartTone;
  total: number;
}) {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeFilled = Math.min(safeTotal, Math.max(0, Math.floor(filled)));
  const visibleTotal = Math.min(safeTotal, Math.max(1, maxVisible));
  const visibleFilled = safeTotal > 0
    ? Math.round((safeFilled / safeTotal) * visibleTotal)
    : 0;

  return (
    <span
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-1", className)}
      data-slot="slot-matrix"
      role="img"
    >
      {Array.from({ length: visibleTotal }, (_, index) => (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-tile bg-muted",
            index < visibleFilled && tone === "primary" && "bg-primary",
            index < visibleFilled && tone === "healthy" && "bg-status-healthy",
            index < visibleFilled && tone === "warning" && "bg-status-warning",
            index < visibleFilled && tone === "critical" && "bg-status-critical",
            index < visibleFilled && tone === "stale" && "bg-status-stale",
            index < visibleFilled && tone === "unknown" && "bg-status-unknown",
          )}
          key={index}
        />
      ))}
    </span>
  );
}
