import { cn } from "@/shared/lib/cn";
import { MiniBar } from "./Bars";
import type { ChartTone } from "./chartPrimitives";

export interface RankListItem {
  ariaLabel: string;
  description?: string;
  displayValue: string;
  href?: string;
  id: string;
  indicator?: "bar" | "dot";
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
      {items.map((item, index) => {
        const content = (
          <>
          <span className="font-mono text-caption tabular-nums text-caption-foreground">
            {index + 1}
          </span>
          <span className="grid min-w-0 gap-1.5">
            <span className="flex min-w-0 items-center gap-2">
              {item.indicator === "dot" ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 shrink-0 rounded-full bg-primary",
                    item.tone === "healthy" && "bg-status-healthy",
                    item.tone === "warning" && "bg-status-warning",
                    item.tone === "critical" && "bg-status-critical",
                    item.tone === "stale" && "bg-status-stale",
                    item.tone === "unknown" && "bg-status-unknown",
                  )}
                />
              ) : null}
              <span className="truncate text-body font-semibold text-foreground">
                {item.label}
              </span>
            </span>
            {item.description ? (
              <span className="truncate font-mono text-caption text-caption-foreground">
                {item.description}
              </span>
            ) : null}
            {item.indicator !== "dot" ? (
              <MiniBar
                ariaLabel={item.ariaLabel}
                max={item.max}
                tone={item.tone}
                value={item.value}
              />
            ) : null}
          </span>
          <span className="font-mono text-caption tabular-nums text-muted-foreground">
            {item.displayValue}
          </span>
          </>
        );
        return (
          <li className="min-w-0" key={item.id}>
            {item.href ? (
              <a
                aria-label={item.ariaLabel}
                className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md p-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
                href={item.href}
              >
                {content}
              </a>
            ) : (
              <span
                aria-label={item.ariaLabel}
                className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2"
              >
                {content}
              </span>
            )}
          </li>
        );
      })}
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
