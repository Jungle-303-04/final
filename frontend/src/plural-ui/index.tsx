// plural-ui — Plural 디자인 시스템 재현 프리미티브 (재사용 레이어)
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { flyoverSlide, modalPop, overlayFade } from './motion';
import './tokens.css';
import './plural.css';
import { CloseIcon, SearchIcon } from './icons';

/* ── 테마 ─────────────────────────────── */
export type ThemeMode = 'dark' | 'light';
const THEME_KEY = 'theme-mode';

export function useThemeMode(): [ThemeMode, () => void] {
  const [mode, setMode] = useState<ThemeMode>(
    () => (localStorage.getItem(THEME_KEY) as ThemeMode) || 'dark',
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme-mode', mode);
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

export function SearchInput({
  value,
  onChange,
  placeholder = '검색',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="pl-search">
      <SearchIcon size={14} />
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ── 모달 ─────────────────────────────── */
export function Modal({
  open,
  title,
  onClose,
  actions,
  size = 'medium',
  children,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  size?: 'medium' | 'large';
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pl-modal-overlay"
          variants={overlayFade}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className={`pl-modal pl-modal--${size}`}
            variants={modalPop}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pl-modal-head">
              <span className="pl-modal-title">{title}</span>
              <button type="button" className="pl-caretbtn" onClick={onClose} aria-label="닫기">
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="pl-modal-body">{children}</div>
            {actions && <div className="pl-modal-actions">{actions}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
          <motion.aside className="pl-flyover" variants={flyoverSlide} onClick={(e) => e.stopPropagation()}>
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

/* ── 빈 상태 / 페이지 헤더 ────────────── */
export function EmptyState({
  title,
  message,
  children,
}: {
  title: string;
  message?: string;
  children?: ReactNode;
}) {
  return (
    <div className="pl-empty">
      <div className="pl-empty-title">{title}</div>
      {message && <div className="pl-empty-msg">{message}</div>}
      {children}
    </div>
  );
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
