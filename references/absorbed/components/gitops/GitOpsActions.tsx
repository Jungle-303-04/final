import { RefreshCw, Pause, Play, Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { SEVERITY_BADGE } from '../../utils/badge-colors'

interface GitOpsActionsProps {
  /** The GitOps tool type */
  tool: 'flux' | 'argo'
  /** Whether the resource is currently suspended */
  suspended: boolean
  /** Sync/Reconcile handler */
  onSync?: () => void
  /** Suspend handler */
  onSuspend?: () => void
  /** Resume handler */
  onResume?: () => void
  /** Whether a sync operation is in progress */
  isSyncing?: boolean
  /** Whether a suspend/resume operation is in progress */
  isSuspending?: boolean
  /** Layout direction */
  direction?: 'row' | 'column'
  /** Button size */
  size?: 'sm' | 'md'
}

/**
 * Action buttons for GitOps resources (Sync, Suspend, Resume)
 */
export function GitOpsActions({
  tool,
  suspended,
  onSync,
  onSuspend,
  onResume,
  isSyncing,
  isSuspending,
  direction = 'row',
  size = 'md',
}: GitOpsActionsProps) {
  const syncLabel = tool === 'flux' ? 'Reconcile' : 'Sync'
  const buttonClass = size === 'sm'
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-1.5'
  const iconClass = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  return (
    <div className={cn('flex gap-2', direction === 'column' ? 'flex-col' : 'flex-row')}>
      {/* Sync/Reconcile button */}
      {onSync && (
        <button
          onClick={onSync}
          disabled={isSyncing || suspended}
          className={cn(
            'flex items-center rounded font-medium transition-colors',
            buttonClass,
            isSyncing
              ? `${SEVERITY_BADGE.info} cursor-wait`
              : suspended
              ? 'bg-popover text-muted-foreground/75 cursor-not-allowed'
              : `${SEVERITY_BADGE.info} hover:bg-sky-500/30`
          )}
          title={suspended ? 'Cannot sync while suspended' : syncLabel}
        >
          {isSyncing ? (
            <Loader2 className={cn(iconClass, 'animate-spin')} />
          ) : (
            <RefreshCw className={iconClass} />
          )}
          {syncLabel}
        </button>
      )}

      {/* Suspend/Resume button */}
      {suspended ? (
        onResume && (
          <button
            onClick={onResume}
            disabled={isSuspending}
            className={cn(
              'flex items-center rounded font-medium transition-colors',
              buttonClass,
              isSuspending
                ? `${SEVERITY_BADGE.success} cursor-wait`
                : `${SEVERITY_BADGE.success} hover:bg-success/30`
            )}
          >
            {isSuspending ? (
              <Loader2 className={cn(iconClass, 'animate-spin')} />
            ) : (
              <Play className={iconClass} />
            )}
            Resume
          </button>
        )
      ) : (
        onSuspend && (
          <button
            onClick={onSuspend}
            disabled={isSuspending}
            className={cn(
              'flex items-center rounded font-medium transition-colors',
              buttonClass,
              isSuspending
                ? `${SEVERITY_BADGE.warning} cursor-wait`
                : `${SEVERITY_BADGE.warning} hover:bg-warning/30`
            )}
          >
            {isSuspending ? (
              <Loader2 className={cn(iconClass, 'animate-spin')} />
            ) : (
              <Pause className={iconClass} />
            )}
            Suspend
          </button>
        )
      )}
    </div>
  )
}

/**
 * Minimal sync-only button for compact UIs
 */
export function SyncButton({
  onClick,
  loading,
  disabled,
  label = 'Sync',
  size = 'md',
}: {
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  label?: string
  size?: 'sm' | 'md'
}) {
  const buttonClass = size === 'sm'
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-1.5'
  const iconClass = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={cn(
        'flex items-center rounded font-medium transition-colors',
        buttonClass,
        loading || disabled
          ? 'bg-popover text-muted-foreground/75 cursor-not-allowed'
          : `${SEVERITY_BADGE.info} hover:bg-sky-500/30`
      )}
    >
      {loading ? (
        <Loader2 className={cn(iconClass, 'animate-spin')} />
      ) : (
        <RefreshCw className={iconClass} />
      )}
      {label}
    </button>
  )
}

/**
 * Suspend/Resume toggle button
 */
export function SuspendToggle({
  suspended,
  onSuspend,
  onResume,
  loading,
  size = 'md',
}: {
  suspended: boolean
  onSuspend: () => void
  onResume: () => void
  loading?: boolean
  size?: 'sm' | 'md'
}) {
  const buttonClass = size === 'sm'
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-1.5'
  const iconClass = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  if (suspended) {
    return (
      <button
        onClick={onResume}
        disabled={loading}
        className={cn(
          'flex items-center rounded font-medium transition-colors',
          buttonClass,
          loading
            ? `${SEVERITY_BADGE.success} cursor-wait`
            : `${SEVERITY_BADGE.success} hover:bg-success/30`
        )}
      >
        {loading ? (
          <Loader2 className={cn(iconClass, 'animate-spin')} />
        ) : (
          <Play className={iconClass} />
        )}
        Resume
      </button>
    )
  }

  return (
    <button
      onClick={onSuspend}
      disabled={loading}
      className={cn(
        'flex items-center rounded font-medium transition-colors',
        buttonClass,
        loading
          ? `${SEVERITY_BADGE.warning} cursor-wait`
          : `${SEVERITY_BADGE.warning} hover:bg-warning/30`
      )}
    >
      {loading ? (
        <Loader2 className={cn(iconClass, 'animate-spin')} />
      ) : (
        <Pause className={iconClass} />
      )}
      Suspend
    </button>
  )
}
