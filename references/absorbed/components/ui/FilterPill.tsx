import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Tooltip } from './Tooltip'

// FilterPill is a single-button toggle filter — clickable pill that
// communicates an active/inactive state. Used in horizontal filter rows
// where each pill toggles one filter on/off (no dropdown — this is the
// toggle pattern, not a combobox).
//
// Tone-encoded active state: when tone='danger' and active=true, the
// pill bg+text use rose; tone='warn' uses amber; etc. This is a
// filter-UI-scoped vocabulary (neutral/danger/warn/ok/brand) — distinct
// from the canonical HealthLevel vocabulary (healthy/degraded/alert/
// unhealthy/neutral/unknown), since "an active filter for danger
// problems" reads better as `tone='danger'` than `tone='unhealthy'`.
// Useful for filter rows that mix severity-bearing categories with
// neutral ones (Critical filters and Warning filters get visually
// distinct active states).
//
// Accessibility: every pill renders aria-pressed automatically, so
// screen readers announce pressed/unpressed correctly. Optional tooltip
// describes the toggle action ("Click to stop filtering by danger").

export type FilterPillTone = 'neutral' | 'danger' | 'warn' | 'ok' | 'brand'

interface Props {
  label: ReactNode
  active: boolean
  onClick: () => void
  /** Active-state color encoding. Default: neutral (Opsia's existing style). */
  tone?: FilterPillTone
  /** Optional leading icon. */
  icon?: LucideIcon
  /** Optional count badge — renders " (N)" after label. */
  count?: number
  /** Tooltip explaining the toggle. Wraps button in Tooltip if set. */
  tooltip?: string
  /** Override the accessible name. Defaults to label + active state. */
  'aria-label'?: string
  className?: string
}

// Always-bordered chip: same border-width in both states keeps geometry stable
// when toggling, and a visible inactive border is what makes pills read as
// pressable chips instead of plain links. Active states fill the chip and
// promote the border to a tone-matched ring.
const TONE_ACTIVE: Record<FilterPillTone, string> = {
  neutral: 'bg-foreground/10 border-foreground/25 text-foreground',
  danger:  'bg-destructive/15 border-destructive/40 text-destructive dark:text-destructive',
  warn:    'bg-warning/15 border-warning/40 text-warning dark:text-warning',
  ok:      'bg-success/15 border-success/40 text-success dark:text-success',
  brand:   'bg-[var(--primary)] border-[var(--primary)] text-foreground dark:bg-[var(--primary)]',
}

const INACTIVE = 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent/50'

export function FilterPill({
  label,
  active,
  onClick,
  tone = 'neutral',
  icon: Icon,
  count,
  tooltip,
  className,
  ...rest
}: Props) {
  const ariaLabel = rest['aria-label']

  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none',
        active ? TONE_ACTIVE[tone] : INACTIVE,
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      <span>{label}</span>
      {count !== undefined && (
        <span className="text-muted-foreground/75">({count})</span>
      )}
    </button>
  )

  if (!tooltip) return button
  return (
    <Tooltip content={tooltip} delay={200}>
      {button}
    </Tooltip>
  )
}
