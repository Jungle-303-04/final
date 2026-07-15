import { cn } from '@/shared/lib/cn'
import { type ReactNode } from 'react'
import { Tooltip } from './Tooltip'

type ColorScheme = 'utilization' | 'count' | 'quiet'

interface ResourceBarProps {
  /** Formatted usage string (e.g., "847m", "2.1Gi", "17") */
  used: string
  /** Formatted total/allocatable string (e.g., "1930m", "7.6Gi", "110") */
  total: string
  /** Usage percentage (0–100) */
  percent: number
  /** Color scheme:
   *  - "utilization": green/yellow/red — node/workload detail surfaces
   *  - "count": blue/yellow
   *  - "quiet": dashboard-calibrated — brand fill, amber only at genuine
   *    scheduling-pressure levels (≥90%), never red. High utilization is a
   *    bin-packing goal, not an incident; alarming it trains amber-blindness. */
  colorScheme?: ColorScheme
  /** Optional marker line position (0–100), e.g., requests as % of allocatable.
   *  Under "quiet" the marker itself turns amber at ≥95% — a cluster whose
   *  requests are at capacity is full to the scheduler even when usage is low. */
  markerPercent?: number
  /** Optional tooltip content shown on hover */
  tooltip?: ReactNode
  /** Layout: "stacked" (default — numbers row above the track) or "inline"
   *  (one row: label · track · percent) for dense cards. Inline requires
   *  `label` and omits the used/total numbers row — put them in `tooltip`. */
  layout?: 'stacked' | 'inline'
  /** Short leading label for the inline layout (e.g. "CPU", "MEM"). */
  label?: string
}

function getBarColor(percent: number, scheme: ColorScheme): string {
  if (scheme === 'count') {
    return percent > 90 ? 'bg-warning' : 'bg-blue-500'
  }
  if (scheme === 'quiet') {
    return percent >= 90 ? 'bg-warning' : 'bg-success'
  }
  if (percent > 85) return 'bg-destructive'
  if (percent > 60) return 'bg-warning'
  return 'bg-success'
}

function getMarkerColor(markerPercent: number, scheme: ColorScheme): string {
  if (scheme === 'quiet' && markerPercent >= 95) return 'bg-warning'
  return 'bg-foreground/70'
}

export function ResourceBar({
  used,
  total,
  percent,
  colorScheme = 'utilization',
  markerPercent,
  tooltip,
  layout = 'stacked',
  label,
}: ResourceBarProps) {
  const track = (
    <div className={cn('relative', layout === 'inline' && 'min-w-0 flex-1')}>
      <div className={cn('rounded-full border border-border bg-popover overflow-hidden', layout === 'inline' ? 'h-1' : 'h-1.5')}>
        <div
          className={cn('h-full rounded-full transition-[width] duration-300 ease-out', getBarColor(percent, colorScheme))}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      {markerPercent != null && markerPercent > 0 && markerPercent <= 100 && (
        <div
          className={cn('absolute -top-[1px] h-[calc(100%+2px)] w-[2px]', getMarkerColor(markerPercent, colorScheme))}
          style={{ left: `${markerPercent}%` }}
        />
      )}
    </div>
  )

  const bar =
    layout === 'inline' ? (
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-7 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/75">{label}</span>
        {track}
        <span className="w-8 shrink-0 text-right text-[10.5px] font-mono tabular-nums text-muted-foreground">
          {Math.round(percent)}%
        </span>
      </div>
    ) : (
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-xs font-mono text-muted-foreground truncate">
            {used} / {total}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/75 shrink-0">
            {Math.round(percent)}%
          </span>
        </div>
        {track}
      </div>
    )

  if (tooltip) {
    return (
      <Tooltip content={tooltip} delay={200} position="top" wrapperClassName="w-full min-w-0">
        {bar}
      </Tooltip>
    )
  }

  return bar
}
