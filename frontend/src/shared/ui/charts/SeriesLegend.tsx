import { seriesColor } from "./colors";
import type { TimeSeries } from "./types";

// Keep dense charts legible; the caller owns the localized overflow copy.
export function SeriesLegend({
  color,
  formatOverflowCount,
  series,
}: {
  color: string;
  formatOverflowCount: (count: number) => string;
  series: TimeSeries[];
}) {
  const labels = series.map((s, i) => s.labels.pod || s.labels.instance || `series-${i}`)
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
      {series.slice(0, 10).map((_, i) => {
        const shortName = labels[i].length > 40 ? '...' + labels[i].slice(-37) : labels[i]
        return (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground/75">
            <svg
              aria-hidden="true"
              className="size-2.5 shrink-0"
              viewBox="0 0 10 10"
            >
              <circle cx="5" cy="5" fill={seriesColor(i, color)} r="5" />
            </svg>
            <span className="truncate" title={labels[i]}>{shortName}</span>
          </div>
        )
      })}
      {series.length > 10 && (
        <span className="text-xs text-muted-foreground/55">
          {formatOverflowCount(series.length - 10)}
        </span>
      )}
    </div>
  )
}
