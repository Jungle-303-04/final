import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import { ChevronDownIcon as ChevronDownGlyph, CopyIcon as CopyGlyph, XIcon as CloseGlyph } from 'lucide-react';
import {
  AnimatePresence,
  collapse,
  drawerSlide,
  fadeInUp,
  listItem,
  listStagger,
  overlayFade,
  scaleIn,
} from '@/ui/motion';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type StatusValue = 'healthy' | 'warning' | 'critical' | 'pending' | 'running' | 'failed';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'border-brand bg-brand text-on-accent shadow-soft hover:bg-brand-hover',
  secondary: 'border-border bg-raised text-text-primary hover:border-border-strong hover:bg-surface',
  ghost: 'border-transparent bg-transparent text-text-secondary hover:bg-raised hover:text-text-primary',
  danger: 'border-danger bg-danger text-on-danger shadow-soft hover:bg-danger/90',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-2 text-label',
  md: 'h-10 px-4 text-body',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  leadingIcon,
  trailingIcon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex max-w-full shrink-0 items-center justify-center gap-2 overflow-hidden rounded-control border font-semibold transition-colors duration-[var(--ui-duration-fast)] ease-standard disabled:cursor-not-allowed disabled:opacity-50',
        focusRing,
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : leadingIcon}
      <span className="min-w-0 truncate">{children}</span>
      {!loading && trailingIcon}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  loading = false,
  className,
  disabled,
  ...props
}: Omit<ButtonProps, 'children' | 'leadingIcon' | 'trailingIcon'> & { label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-control border font-semibold transition-colors duration-[var(--ui-duration-fast)] ease-standard disabled:cursor-not-allowed disabled:opacity-50',
        focusRing,
        buttonVariants[variant],
        size === 'sm' ? 'h-8 w-8 text-label' : 'h-10 w-10 text-body',
        className,
      )}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
    </button>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  loading,
  empty,
  error,
  onRetry,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  empty?: ReactNode;
  error?: string | Error | null;
  onRetry?: () => void;
  className?: string;
}) {
  const errorMessage = typeof error === 'string' ? error : error?.message;
  return (
    <motion.section
      layout
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      className={cx('min-w-0 rounded-panel border border-border bg-surface p-4 shadow-soft', className)}
    >
      {(title || description || actions) && (
        <div className="mb-4 flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="truncate text-title font-semibold text-text-primary">{title}</h2>}
            {description && <p className="mt-1 text-body text-text-secondary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {loading ? (
        <Skeleton lines={4} />
      ) : errorMessage ? (
        <EmptyState title="불러오기 실패" description={errorMessage} action={onRetry && <Button size="sm" onClick={onRetry}>다시 시도</Button>} />
      ) : empty ? (
        empty
      ) : (
        children
      )}
    </motion.section>
  );
}

export function StatCard({
  label,
  value,
  delta,
  tone = 'neutral',
  spark,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  tone?: Tone;
  spark?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-label font-medium text-text-muted">{label}</p>
          <p className="mt-2 truncate text-page font-semibold tabular-nums text-text-primary">{value}</p>
          {delta && <p className={cx('mt-1 text-caption font-medium', toneClass(tone))}>{delta}</p>}
        </div>
        {spark && (
          <div className="h-10 w-24 shrink-0 overflow-hidden rounded-control border border-border bg-raised">
            {spark}
          </div>
        )}
      </div>
    </Card>
  );
}

export interface TableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right';
  width?: 'sm' | 'md' | 'lg';
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  empty,
  onRetry,
  onRowClick,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  error?: string | Error | null;
  empty?: ReactNode;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
}) {
  const [sort, setSort] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.id === sort.id);
    if (!column?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = column.sortValue?.(a);
      const bv = column.sortValue?.(b);
      const result = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'ko');
      return sort.dir === 'asc' ? result : -result;
    });
  }, [columns, rows, sort]);
  const errorMessage = typeof error === 'string' ? error : error?.message;

  if (loading) return <Skeleton lines={6} />;
  if (errorMessage) {
    return <EmptyState title="목록 조회 실패" description={errorMessage} action={onRetry && <Button size="sm" onClick={onRetry}>다시 시도</Button>} />;
  }
  if (rows.length === 0) return <>{empty ?? <EmptyState title="항목 없음" description="조건에 맞는 항목이 없습니다" />}</>;

  return (
    <div className="max-w-full overflow-x-auto rounded-panel border border-border">
      <table className="min-w-full table-fixed border-collapse bg-surface text-left text-body">
        <thead className="sticky top-0 z-10 bg-raised text-label text-text-muted">
          <tr>
            {columns.map((column) => {
              const active = sort?.id === column.id;
              return (
                <th key={column.id} scope="col" className={cx('border-b border-border px-4 py-2 font-semibold', column.align === 'right' && 'text-right', widthClass(column.width))}>
                  {column.sortValue ? (
                    <button
                      type="button"
                      className={cx('inline-flex max-w-full items-center gap-2 rounded-control text-left', focusRing)}
                      onClick={() => setSort(active && sort.dir === 'asc' ? { id: column.id, dir: 'desc' } : { id: column.id, dir: 'asc' })}
                    >
                      <span className="truncate">{column.header}</span>
                      <span className="text-text-muted">{active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <motion.tbody variants={listStagger} initial="initial" animate="animate">
          <AnimatePresence initial={false}>
            {sortedRows.map((row, index) => (
              <motion.tr
                key={rowKey(row, index)}
                layout
                variants={listItem}
                className={cx('border-b border-border last:border-b-0 hover:bg-raised', onRowClick && 'cursor-pointer')}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                onClick={() => onRowClick?.(row)}
                onKeyDown={(event) => activateRow(event, row, onRowClick)}
              >
                {columns.map((column) => (
                  <td key={column.id} className={cx('min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 align-middle text-text-secondary', column.align === 'right' && 'text-right')}>
                    {column.cell(row)}
                  </td>
                ))}
              </motion.tr>
            ))}
          </AnimatePresence>
        </motion.tbody>
      </table>
    </div>
  );
}

function activateRow<T>(event: ReactKeyboardEvent<HTMLTableRowElement>, row: T, onRowClick?: (row: T) => void) {
  if (!onRowClick || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  onRowClick(row);
}

function widthClass(width?: TableColumn<unknown>['width']) {
  if (width === 'sm') return 'w-32';
  if (width === 'lg') return 'w-80';
  return width === 'md' ? 'w-48' : undefined;
}

export function Tabs({
  items,
  value,
  onValueChange,
}: {
  items: Array<{ value: string; label: string; count?: number; disabled?: boolean }>;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto border-b border-border" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          disabled={item.disabled}
          className={cx(
            'h-10 shrink-0 rounded-t-control border-b-2 px-4 text-body font-medium transition-colors disabled:opacity-50',
            focusRing,
            value === item.value ? 'border-brand text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary',
          )}
          onClick={() => onValueChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && <span className="ml-2 text-caption text-text-muted">{item.count.toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex max-w-full items-center gap-2 rounded-control border px-2 py-1 text-caption font-semibold', toneBorderClass(tone), toneClass(tone))}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

const statusMeta: Record<StatusValue, { label: string; tone: Tone }> = {
  healthy: { label: '정상', tone: 'success' },
  warning: { label: '주의', tone: 'warning' },
  critical: { label: '심각', tone: 'danger' },
  pending: { label: '대기', tone: 'warning' },
  running: { label: '실행 중', tone: 'info' },
  failed: { label: '실패', tone: 'danger' },
};

export function StatusChip({ status, label }: { status: StatusValue; label?: string }) {
  const meta = statusMeta[status];
  return <Badge tone={meta.tone}>{label ?? meta.label}</Badge>;
}

export function Modal({
  open,
  title,
  description,
  children,
  actions,
  onOpenChange,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onOpenChange: (open: boolean) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(open, () => onOpenChange(false));
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-sm" variants={overlayFade} initial="initial" animate="animate" exit="exit" onMouseDown={() => onOpenChange(false)}>
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-panel border border-border bg-surface p-6 shadow-elevated"
            variants={scaleIn}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-page font-semibold text-text-primary">{title}</h2>
                {description && <p id={descriptionId} className="mt-1 text-body text-text-secondary">{description}</p>}
              </div>
              <IconButton size="sm" label="닫기" icon={<CloseGlyph />} onClick={() => onOpenChange(false)} />
            </div>
            <div className="min-w-0">{children}</div>
            {actions && <div className="mt-6 flex justify-end gap-2">{actions}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({
  open,
  title,
  description,
  children,
  actions,
  onOpenChange,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onOpenChange: (open: boolean) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const drawerRef = useDialogFocus<HTMLElement>(open, () => onOpenChange(false));
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm" variants={overlayFade} initial="initial" animate="animate" exit="exit" onClick={() => onOpenChange(false)} />
          <motion.aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-surface shadow-elevated"
            variants={drawerSlide}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-6">
              <div className="min-w-0">
                <h2 id={titleId} className="text-page font-semibold text-text-primary">{title}</h2>
                {description && <p id={descriptionId} className="mt-1 text-body text-text-secondary">{description}</p>}
              </div>
              <IconButton size="sm" label="닫기" icon={<CloseGlyph />} onClick={() => onOpenChange(false)} />
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6">{children}</div>
            {actions && <div className="flex justify-end gap-2 border-t border-border p-4">{actions}</div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function Dropdown({
  label,
  children,
  align = 'end',
}: {
  label: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex">
      <Button size="sm" variant="secondary" trailingIcon={<ChevronDownGlyph />} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {label}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            variants={scaleIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cx('absolute top-10 z-40 min-w-48 rounded-panel border border-border bg-surface p-1 shadow-elevated', align === 'end' ? 'right-0' : 'left-0')}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({
  children,
  onSelect,
  tone = 'neutral',
  disabled,
}: {
  children: ReactNode;
  onSelect?: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cx('flex h-9 w-full items-center rounded-control px-3 text-left text-body transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50', focusRing, toneClass(tone))}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

type FieldContextValue = { id?: string; describedBy?: string; invalid?: boolean };
const FieldContext = createContext<FieldContextValue>({});

export function Field({
  label,
  help,
  error,
  id,
  children,
}: {
  label: string;
  help?: ReactNode;
  error?: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : help ? helpId : undefined;
  return (
    <FieldContext.Provider value={{ id: inputId, describedBy, invalid: Boolean(error) }}>
      <div className="grid gap-2">
        <label htmlFor={inputId} className="text-label font-semibold text-text-secondary">{label}</label>
        {children}
        {help && !error && <p id={helpId} className="text-caption text-text-muted">{help}</p>}
        {error && <p id={errorId} role="alert" className="text-caption font-medium text-danger">{error}</p>}
      </div>
    </FieldContext.Provider>
  );
}

const controlClass = cx(
  'h-10 w-full rounded-control border border-border bg-bg px-3 text-body text-text-primary shadow-soft transition-colors placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50',
  'focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20',
);

export function Input(props: ComponentPropsWithoutRef<'input'>) {
  const field = useContext(FieldContext);
  return <input {...props} id={props.id ?? field.id} aria-describedby={props['aria-describedby'] ?? field.describedBy} aria-invalid={props['aria-invalid'] ?? field.invalid} className={cx(controlClass, props.className)} />;
}

export function Select(props: ComponentPropsWithoutRef<'select'>) {
  const field = useContext(FieldContext);
  return <select {...props} id={props.id ?? field.id} aria-describedby={props['aria-describedby'] ?? field.describedBy} aria-invalid={props['aria-invalid'] ?? field.invalid} className={cx(controlClass, props.className)} />;
}

export function Textarea(props: ComponentPropsWithoutRef<'textarea'>) {
  const field = useContext(FieldContext);
  return <textarea {...props} id={props.id ?? field.id} aria-describedby={props['aria-describedby'] ?? field.describedBy} aria-invalid={props['aria-invalid'] ?? field.invalid} className={cx(controlClass, 'min-h-24 resize-y py-2', props.className)} />;
}

export function Checkbox({ label, description, ...props }: ComponentPropsWithoutRef<'input'> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={props.id ?? id} className="flex cursor-pointer items-start gap-3 rounded-control border border-border bg-bg p-3 transition-colors hover:bg-raised">
      <input
        {...props}
        id={props.id ?? id}
        type="checkbox"
        className={cx('mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent', focusRing, props.className)}
      />
      <span className="grid gap-1">
        <span className="text-body font-semibold text-text-primary">{label}</span>
        {description && <span className="text-caption text-text-muted">{description}</span>}
      </span>
    </label>
  );
}

type ToastMessage = { id: number; tone: Tone; title: string; description?: string };
type ToastApi = {
  toasts: ToastMessage[];
  push: (toast: Omit<ToastMessage, 'id'>) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi>({
  toasts: [],
  push: () => undefined,
  dismiss: () => undefined,
});

let toastSequence = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((toast) => toast.id !== id)), []);
  const push = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = ++toastSequence;
    setToasts((items) => [...items, { ...toast, id }]);
    window.setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);
  const value = useMemo(() => ({ toasts, push, dismiss }), [dismiss, push, toasts]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  return useContext(ToastContext);
}

export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-[70] grid w-[min(24rem,calc(100vw-2rem))] gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            exit="exit"
            role="status"
            className={cx('rounded-panel border bg-surface p-4 shadow-elevated', toneBorderClass(toast.tone))}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={cx('text-body font-semibold', toneClass(toast.tone))}>{toast.title}</p>
                {toast.description && <p className="mt-1 text-label text-text-secondary">{toast.description}</p>}
              </div>
              <IconButton size="sm" label="닫기" icon={<CloseGlyph />} onClick={() => dismiss(toast.id)} />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            exit="exit"
            role="tooltip"
            className="absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-64 -translate-x-1/2 rounded-control border border-border bg-surface px-2 py-1 text-caption text-text-secondary shadow-elevated"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Skeleton({ lines = 1, className }: { lines?: number; className?: string }) {
  const widths = ['w-full', 'w-11/12', 'w-10/12', 'w-8/12'];
  return (
    <div className={cx('grid gap-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className={cx('h-4 rounded-control bg-raised motion-safe:animate-pulse', widths[index % widths.length])} />
      ))}
    </div>
  );
}

export function InlineSpinner({ label = '처리 중' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-caption font-medium text-text-muted" role="status">
      <Spinner />
      <span>{label}</span>
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <motion.div variants={scaleIn} initial="initial" animate="animate" className="grid min-h-32 place-items-center rounded-panel border border-dashed border-border bg-bg p-6 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        {icon && <div className="grid h-10 w-10 place-items-center rounded-panel border border-border bg-surface text-text-muted">{icon}</div>}
        <div className="grid gap-1">
          <h3 className="text-title font-semibold text-text-primary">{title}</h3>
          {description && <p className="text-body text-text-secondary">{description}</p>}
        </div>
        {action && <div className="mt-1">{action}</div>}
      </div>
    </motion.div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-6 grid gap-4">
      {breadcrumb}
      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-page font-semibold text-text-primary">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-body text-text-secondary">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-2 text-label text-text-muted">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex min-w-0 items-center gap-2">
          {index > 0 && <span>/</span>}
          {item.href ? (
            <a className={cx('min-w-0 truncate hover:text-text-primary', focusRing)} href={item.href}>{item.label}</a>
          ) : (
            <span className="min-w-0 truncate text-text-secondary">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function CodeBlock({ code, label = '코드' }: { code: string; label?: string }) {
  const { push } = useToast();
  const copy = () => {
    navigator.clipboard.writeText(code)
      .then(() => push({ tone: 'success', title: '복사 완료', description: `${label}를 클립보드에 복사했습니다` }))
      .catch(() => push({ tone: 'danger', title: '복사 실패', description: '브라우저 권한을 확인해주세요' }));
  };
  return (
    <div className="relative overflow-hidden rounded-panel border border-border bg-bg">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
        <span className="text-label font-semibold text-text-secondary">{label}</span>
        <IconButton size="sm" label="복사" icon={<CopyGlyph />} onClick={copy} />
      </div>
      <pre className="max-h-80 overflow-auto p-4 font-mono text-caption text-text-secondary"><code>{code}</code></pre>
    </div>
  );
}

export function KeyValueList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-body">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="min-w-0 truncate text-text-muted">{item.label}</dt>
          <dd className="min-w-0 break-words text-text-secondary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'danger',
  pending,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  pending?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm();
  };
  return (
    <Modal open={open} title={title} description={description} onOpenChange={onOpenChange}>
      <form onSubmit={submit} className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>{cancelLabel}</Button>
        <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} loading={pending}>{confirmLabel}</Button>
      </form>
    </Modal>
  );
}

export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div variants={collapse} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Spinner() {
  return <span className="h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" aria-hidden="true" />;
}

function toneClass(tone: Tone) {
  return {
    neutral: 'text-text-muted',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
  }[tone];
}

function toneBorderClass(tone: Tone) {
  return {
    neutral: 'border-border',
    success: 'border-success/40',
    warning: 'border-warning/40',
    danger: 'border-danger/40',
    info: 'border-info/40',
  }[tone];
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function useDialogFocus<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const node = ref.current;
      const first = node?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? node)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'Tab' && ref.current) trapTab(event, ref.current);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);
  return ref;
}

function trapTab(event: KeyboardEvent, container: HTMLElement) {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.offsetParent !== null || element === document.activeElement);
  if (!focusable.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
