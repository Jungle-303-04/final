import { cn } from '@/shared/lib/cn'

export type SummaryTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'

// A compact count tile for a view's status summary — value over label, with a
// tone-colored value and (when clickable) an active border that doubles as a
// one-click filter. Lives in the shared list-view chassis: GitOps and
// Applications both surface their status rollup as a row of these in the header.
export function SummaryTile({
  label,
  value,
  tone = 'neutral',
  onClick,
  active = false,
  loading = false,
}: {
  label: string
  value: number
  tone?: SummaryTone
  onClick?: () => void
  active?: boolean
  /** First fetch in flight — render a pulse instead of the value. A tile
   *  that reads "0" while loading is a false zero, not a count. */
  loading?: boolean
}) {
  const toneClass = {
    neutral: 'text-foreground',
    success: 'text-success dark:text-success',
    warning: 'text-warning dark:text-warning',
    error: 'text-destructive dark:text-destructive',
    info: 'text-sky-600 dark:text-sky-300',
  }[tone]
  const activeBorderClass = {
    neutral: 'border-primary',
    success: 'border-success',
    warning: 'border-warning',
    error: 'border-destructive',
    info: 'border-sky-500',
  }[tone]
  const value$ = loading ? (
    <div className="my-1 h-3.5 w-8 animate-pulse rounded bg-accent" aria-hidden />
  ) : (
    <div className={`text-sm font-semibold ${toneClass}`}>{value}</div>
  )
  const label$ = <div className="text-xs text-muted-foreground/75">{label}</div>
  if (!onClick) {
    return (
      <div className="rounded-md border border-border bg-background px-3 py-2">
        {value$}
        {label$}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'cursor-pointer rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active ? activeBorderClass : 'border-border',
      )}
    >
      {value$}
      {label$}
    </button>
  )
}
