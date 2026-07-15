import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'
import { DURATION_TOAST_EXIT } from '../../utils/animation'
import { Check, Terminal, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

interface Toast {
  id: string
  message: string
  detail?: string
  command?: string
  type?: 'success' | 'info' | 'warning' | 'error'
  position?: { x: number; y: number }
  dismissing?: boolean
  action?: { label: string; icon?: ReactNode; onClick: () => void }
  onDetailClick?: () => void
}

interface ToastContextType {
  showToast: (message: string, options?: {
    detail?: string
    command?: string
    type?: Toast['type']
    position?: { x: number; y: number }
    action?: Toast['action']
    onDetailClick?: () => void
  }) => void
  showCopied: (command: string, label?: string, event?: React.MouseEvent) => void
  showError: (message: string, detail?: string) => void
  showSuccess: (message: string, detail?: string, action?: Toast['action'], onDetailClick?: () => void) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

// Singleton pattern for showing toasts outside React components (e.g., in API error handlers)
class ToastManager {
  private static instance: ToastManager
  private showErrorFn: ((message: string, detail?: string) => void) | null = null
  private showSuccessFn: ((message: string, detail?: string, action?: Toast['action'], onDetailClick?: () => void) => void) | null = null

  static getInstance(): ToastManager {
    if (!ToastManager.instance) {
      ToastManager.instance = new ToastManager()
    }
    return ToastManager.instance
  }

  register(showError: typeof this.showErrorFn, showSuccess: typeof this.showSuccessFn) {
    this.showErrorFn = showError
    this.showSuccessFn = showSuccess
  }

  unregister() {
    this.showErrorFn = null
    this.showSuccessFn = null
  }

  showError(message: string, detail?: string) {
    this.showErrorFn ? this.showErrorFn(message, detail) : console.error('[Toast]', message, detail)
  }

  showSuccess(message: string, detail?: string, action?: Toast['action'], onDetailClick?: () => void) {
    this.showSuccessFn ? this.showSuccessFn(message, detail, action, onDetailClick) : console.log('[Toast]', message, detail)
  }
}

const toastManager = ToastManager.getInstance()

export function showApiError(message: string, detail?: string) {
  toastManager.showError(message, detail)
}

export function showApiSuccess(message: string, detail?: string, action?: Toast['action'], onDetailClick?: () => void) {
  toastManager.showSuccess(message, detail, action, onDetailClick)
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const animateDismiss = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, dismissing: true } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, DURATION_TOAST_EXIT)
  }, [])

  const showToast = useCallback((message: string, options?: {
    detail?: string
    command?: string
    type?: Toast['type']
    position?: { x: number; y: number }
    action?: Toast['action']
    onDetailClick?: () => void
  }) => {
    const id = Math.random().toString(36).slice(2)
    const toast: Toast = { id, message, ...options }

    setToasts(prev => [...prev, toast])

    // Auto-dismiss: errors stay longer (10s), others 7s
    const dismissTime = options?.type === 'error' ? 10000 : 7000
    setTimeout(() => {
      animateDismiss(id)
    }, dismissTime)
  }, [animateDismiss])

  const showCopied = useCallback((command: string, label?: string, event?: React.MouseEvent) => {
    navigator.clipboard.writeText(command)

    // Get position from click event
    let position: { x: number; y: number } | undefined
    if (event) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      position = { x: rect.left, y: rect.bottom + 8 }
    }

    showToast(label || 'Copied to clipboard', { command, type: 'success', position })
  }, [showToast])

  const showError = useCallback((message: string, detail?: string) => {
    showToast(message, { detail, type: 'error' })
  }, [showToast])

  const showSuccess = useCallback((message: string, detail?: string, action?: Toast['action'], onDetailClick?: () => void) => {
    showToast(message, { detail, type: 'success', action, onDetailClick })
  }, [showToast])

  const dismissToast = useCallback((id: string) => {
    animateDismiss(id)
  }, [animateDismiss])

  // Wire up singleton for use outside React components
  useEffect(() => {
    toastManager.register(showError, showSuccess)
    return () => toastManager.unregister()
  }, [showError, showSuccess])

  return (
    <ToastContext.Provider value={{ showToast, showCopied, showError, showSuccess }}>
      {children}

      {/* Render toasts */}
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Calculate position - either near button or default to bottom-right
  const style: React.CSSProperties = toast.position
    ? {
        position: 'fixed',
        left: Math.min(toast.position.x, window.innerWidth - 520),
        top: toast.position.y,
        zIndex: 50,
      }
    : {
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 50,
      }

  const isError = toast.type === 'error'
  const isSuccess = toast.type === 'success'

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg shadow-2xl border backdrop-blur-sm',
        'w-[480px] max-w-[calc(100vw-32px)]',
        toast.dismissing ? 'animate-out' : 'animate-in',
        isError
          ? 'bg-destructive border-destructive/60'
          : isSuccess
            ? 'bg-success border-success/50'
            : 'bg-card border-border'
      )}
      style={style}
    >
      {/* Icon */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
        isError ? 'bg-destructive/20' :
        isSuccess ? 'bg-success/20' : 'bg-blue-500/20'
      )}>
        {isError ? (
          <AlertTriangle className="w-4 h-4 text-destructive" />
        ) : toast.command ? (
          <Terminal className={cn('w-4 h-4', isSuccess ? 'text-success' : 'text-blue-400')} />
        ) : (
          <Check className="w-4 h-4 text-success" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium', isError ? 'text-destructive' : isSuccess ? 'text-success' : 'text-foreground')}>
            {toast.message}
          </span>
          {!isError && !toast.action && <Check className={cn('w-3.5 h-3.5 shrink-0', isSuccess ? 'text-success' : 'text-success')} />}
        </div>
        {toast.detail && (
          toast.onDetailClick ? (
            <button
              onClick={toast.onDetailClick}
              className={cn(
                'mt-1.5 block text-xs font-mono break-words text-left rounded px-1.5 py-1 -ml-1.5 transition-colors',
                isError
                  ? 'text-destructive hover:bg-destructive/50'
                  : isSuccess
                    ? 'text-success/90 hover:text-success hover:bg-success/50'
                    : 'text-muted-foreground hover:bg-popover'
              )}
              title="Click to open file"
            >
              {toast.detail}
            </button>
          ) : (
            <p className={cn('mt-1 text-xs break-words', isError ? 'text-destructive/80' : isSuccess ? 'text-success/80' : 'text-muted-foreground')}>
              {toast.detail}
            </p>
          )
        )}
        {toast.command && (
          <code className="block mt-1.5 text-xs text-muted-foreground font-mono bg-background rounded px-2 py-1.5 whitespace-pre-wrap break-all">
            {toast.command}
          </code>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className={cn(
              'mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded transition-colors',
              isSuccess
                ? 'text-success bg-success/50 hover:bg-success/50 border border-success/40'
                : 'text-muted-foreground bg-popover hover:bg-card border border-border'
            )}
          >
            {toast.action.icon}
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className={cn(
          'p-1 rounded shrink-0 transition-colors',
          isError
            ? 'text-destructive hover:text-destructive hover:bg-destructive/50'
            : isSuccess
              ? 'text-success hover:text-success hover:bg-success/50'
              : 'text-muted-foreground/75 hover:text-foreground hover:bg-popover'
        )}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
