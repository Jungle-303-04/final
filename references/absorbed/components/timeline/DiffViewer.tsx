import { memo } from 'react'
import { cn } from '@/shared/lib/cn'
import { ArrowRight, Plus, Minus, RefreshCw } from 'lucide-react'
import type { DiffInfo, FieldChange } from '../../types'

interface DiffViewerProps {
  diff: DiffInfo
  compact?: boolean
}

export const DiffViewer = memo(function DiffViewer({ diff, compact = false }: DiffViewerProps) {
  if (!diff || diff.fields.length === 0) {
    return null
  }

  if (compact) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <RefreshCw className="w-3 h-3" />
        <span>{diff.summary || `${diff.fields.length} field(s) changed`}</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Summary */}
      {diff.summary && (
        <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-blue-400" />
          {diff.summary}
        </div>
      )}

      {/* Field changes */}
      <div className="space-y-1.5">
        {diff.fields.map((field, idx) => (
          <FieldChangeRow key={`${field.path}-${idx}`} field={field} />
        ))}
      </div>
    </div>
  )
})

interface FieldChangeRowProps {
  field: FieldChange
}

function FieldChangeRow({ field }: FieldChangeRowProps) {
  const isAdded = field.oldValue === null || field.oldValue === undefined
  const isRemoved = field.newValue === null || field.newValue === undefined
  const isModified = !isAdded && !isRemoved

  return (
    <div className="rounded bg-card/50 border border-border px-3 py-2">
      {/* Field path */}
      <div className="text-xs font-mono text-muted-foreground/75 mb-1">{field.path}</div>

      {/* Values */}
      <div className="flex items-center gap-2 text-sm">
        {isAdded ? (
          <>
            <Plus className="w-3.5 h-3.5 text-success shrink-0" />
            <span className="text-success">
              {formatValue(field.newValue)}
            </span>
          </>
        ) : isRemoved ? (
          <>
            <Minus className="w-3.5 h-3.5 text-destructive shrink-0" />
            <span className="text-destructive line-through">
              {formatValue(field.oldValue)}
            </span>
          </>
        ) : isModified ? (
          <>
            <span className="text-destructive line-through">
              {formatValue(field.oldValue)}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
            <span className="text-success">
              {formatValue(field.newValue)}
            </span>
          </>
        ) : null}
      </div>
    </div>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null'
  }
  if (typeof value === 'object') {
    try {
      const str = JSON.stringify(value)
      // Truncate long values
      if (str.length > 100) {
        return str.slice(0, 97) + '...'
      }
      return str
    } catch {
      return String(value)
    }
  }
  return String(value)
}

// Inline diff badge for use in event cards
interface DiffBadgeProps {
  diff: DiffInfo
}

export const DiffBadge = memo(function DiffBadge({ diff }: DiffBadgeProps) {
  if (!diff || !diff.summary) {
    return null
  }

  return (
    <span
      className={cn(
        'badge',
        'bg-primary/10 text-primary border border-primary/20'
      )}
    >
      <RefreshCw className="w-3 h-3" />
      {diff.summary}
    </span>
  )
})
