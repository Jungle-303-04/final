import { ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { SEVERITY_TEXT, SEVERITY_BADGE_BORDERED } from '../../utils/badge-colors'
import { DialogPortal } from './DialogPortal'


interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  details?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  isLoading?: boolean
  isClosable?: boolean // Allow closing even when isLoading (e.g., for long-running ops the user can dismiss)
  confirmDisabled?: boolean // Block the confirm action while custom content is invalid (e.g., bad YAML)
  className?: string
  children?: ReactNode // Optional custom content (e.g., checkboxes)
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
  isClosable = false,
  confirmDisabled = false,
  className,
  children,
}: ConfirmDialogProps) {
  const canClose = !isLoading || isClosable
  const isDanger = variant === 'danger'
  const severity = isDanger ? 'error' : 'warning'

  return (
    <DialogPortal open={open} onClose={onClose} closable={canClose} className={cn('w-full', className ?? 'max-w-md')}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b border-border">
        <div
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-full shrink-0',
            isDanger ? 'bg-destructive/20' : 'bg-warning/20'
          )}
        >
          <AlertTriangle className={cn('w-5 h-5', SEVERITY_TEXT[severity])} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        </div>
        <button
          onClick={onClose}
          disabled={!canClose}
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-popover rounded disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Details */}
      {details && (
        <div className="p-4 border-b border-border">
          <pre className="text-xs text-muted-foreground bg-background/50 rounded p-3 overflow-auto max-h-32 whitespace-pre-wrap font-mono">
            {details}
          </pre>
        </div>
      )}

      {/* Custom content */}
      {children && (
        <div className="px-4 py-4">
          {children}
        </div>
      )}

      {/* Warning message — hidden once the action is in progress */}
      {!isLoading && !children && (
        <div className="p-4">
          <div
            className={cn(
              'flex items-start gap-2 p-3 rounded text-sm',
              SEVERITY_BADGE_BORDERED[severity]
            )}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {isDanger
                ? 'This action cannot be undone. Please make sure you want to proceed.'
                : 'Please confirm you want to proceed with this action.'}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
        <button
          onClick={onClose}
          disabled={!canClose}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-popover rounded-lg transition-colors disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading || confirmDisabled}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2',
            isDanger
              ? 'bg-destructive hover:bg-destructive text-foreground'
              : 'bg-warning hover:bg-warning text-foreground'
          )}
        >
          {isLoading && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          {confirmLabel}
        </button>
      </div>
    </DialogPortal>
  )
}
