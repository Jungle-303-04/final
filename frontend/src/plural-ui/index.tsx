// plural-ui — Plural 디자인 시스템 재현 프리미티브 (재사용 레이어)
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { flyoverSlide, overlayFade } from './motion';
import { CloseIcon } from './icons';

/* ── 테마 ─────────────────────────────── */
export type ThemeMode = 'dark' | 'light';
const THEME_KEY = 'theme-mode';

export function useThemeMode(): [ThemeMode, () => void] {
  const [mode, setMode] = useState<ThemeMode>(
    () => (localStorage.getItem(THEME_KEY) as ThemeMode) || 'dark',
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme-mode', mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.classList.toggle('light', mode === 'light');
    localStorage.setItem(THEME_KEY, mode);
  }, [mode]);
  const toggle = useCallback(() => setMode((m) => (m === 'dark' ? 'light' : 'dark')), []);
  return [mode, toggle];
}

/* ── 버튼/칩/기본 ─────────────────────── */
export function Button({
  variant = 'secondary',
  size = 'medium',
  destructive = false,
  disabled = false,
  children,
  onClick,
}: {
  variant?: 'primary' | 'secondary';
  size?: 'large' | 'medium' | 'small';
  destructive?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`pl-btn pl-btn--${size} pl-btn--${variant}${destructive ? ' pl-btn--destructive' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export type ChipSeverity = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

export function Chip({
  severity = 'neutral',
  children,
}: {
  severity?: ChipSeverity;
  children: ReactNode;
}) {
  const cls = severity === 'neutral' ? '' : ` pl-chip--${severity}`;
  return <span className={`pl-chip${cls}`}>{children}</span>;
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`pl-card ${className}`}>{children}</div>;
}

/* ── 테이블 ──────────────────────────── */
export function Table({ headers, children }: { headers: ReactNode[]; children: ReactNode }) {
  return (
    <div className="pl-tablewrap">
      <table className="pl-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ── 플라이오버 (우측 슬라이드 패널) ──── */
export function Flyover({
  open,
  title,
  onClose,
  actions,
  children,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const flyoverRef = useDialogFocus<HTMLElement>(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pl-flyover-overlay"
          variants={overlayFade}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={onClose}
        >
          <motion.aside
            ref={flyoverRef}
            className="pl-flyover"
            variants={flyoverSlide}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pl-modal-head">
              <span className="pl-modal-title">{title}</span>
              <button type="button" className="pl-caretbtn" onClick={onClose} aria-label="닫기">
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="pl-flyover-body">{children}</div>
            {actions && <div className="pl-modal-actions">{actions}</div>}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
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
    .filter(element => element.offsetParent !== null || element === document.activeElement);
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

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pl-pagehead">
      <div>
        <h1 className="pl-h1">{title}</h1>
        {sub && <p className="pl-sub">{sub}</p>}
      </div>
      {actions && <div className="pl-pagehead-actions">{actions}</div>}
    </div>
  );
}
