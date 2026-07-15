import { cn } from '@/shared/lib/cn'

export interface DistributionSegment {
  key: string
  count: number
  /** Tailwind background class for this segment's fill (e.g. status-tone bg). */
  fillClass: string
}

// A single segmented proportion bar — the shared "distribution of statuses"
// element behind the Checks severity rollup, the Applications/GitOps health
// rollup, and the Issues rollup. One height, one track, one radius everywhere.
//
// Intentional empty state: with no data (sum === 0) it renders NOTHING rather
// than a flat grey track that reads as a skeleton/loading bar on sparse clusters.
export function DistributionBar({
  segments,
  className,
  ariaLabel = 'Distribution',
}: {
  segments: DistributionSegment[]
  className?: string
  ariaLabel?: string
}) {
  const sum = segments.reduce((n, s) => n + s.count, 0)
  if (sum === 0) return null
  return (
    <div
      className={cn('flex h-1.5 overflow-hidden rounded-full bg-popover', className)}
      role="img"
      aria-label={ariaLabel}
    >
      {segments.map((s) =>
        s.count > 0 ? (
          <div
            key={s.key}
            className={cn(s.fillClass, 'transition-[width] duration-500 ease-out')}
            style={{ width: `${(s.count / sum) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  )
}

// A legend entry for a DistributionBar: a tone dot + count + label. When onClick
// is provided it's a toggle (the legend doubles as the filter, as in the Checks
// and Issues queues); without it, it's a static legend item.
export function DistributionLegendChip({
  label,
  count,
  fillClass,
  textClass,
  active = false,
  onClick,
}: {
  label: string
  count: number
  fillClass: string
  /** Tone text class applied to the count when count > 0. */
  textClass?: string
  active?: boolean
  onClick?: () => void
}) {
  const inner = (
    <>
      <span className={cn('h-2 w-2 rounded-full', fillClass, count === 0 && 'opacity-30')} />
      <span className={cn('font-semibold tabular-nums', count > 0 ? textClass : 'text-muted-foreground/75')}>{count}</span>
      <span>{label}</span>
    </>
  )
  if (!onClick) {
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground">{inner}</span>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
        active ? 'border-border bg-popover text-foreground' : 'border-transparent text-muted-foreground hover:bg-accent/60',
      )}
    >
      {inner}
    </button>
  )
}
