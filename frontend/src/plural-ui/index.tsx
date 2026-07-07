// plural-ui — Plural 디자인 시스템 재현 프리미티브 (재사용 레이어)
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { NavLink } from 'react-router-dom';
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

export function IconFrame({ size = 'md', children }: { size?: 'md' | 'lg'; children: ReactNode }) {
  return <div className={`pl-iconframe pl-iconframe--${size}`}>{children}</div>;
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`pl-card ${className}`}>{children}</div>;
}

/* ── 탭 ──────────────────────────────── */
export function TabList<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="pl-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === value}
          className={`pl-tab${t.key === value ? ' active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** 라우터 연동 탭 (URL 이동) */
export function LinkTabList({ tabs }: { tabs: { to: string; label: string; end?: boolean }[] }) {
  return (
    <div className="pl-tabs" role="tablist">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => `pl-tab${isActive ? ' active' : ''}`}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

/** 세로 서브내비 (account/profile 설정 메뉴) */
export function SideNav({ items }: { items: { to: string; label: string; end?: boolean }[] }) {
  return (
    <nav className="pl-sidenav">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) => `pl-sidenav-item${isActive ? ' active' : ''}`}
        >
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
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

/* ── 입력 ─────────────────────────────── */
export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      className="pl-input"
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
    />
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

export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="pl-field">
      <span className="pl-field-label">{label}</span>
      {children}
      {hint && <span className="pl-field-hint">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`pl-switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
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

/* ── 멀티스텝 위저드 모달 ─────────────── */
export function WizardModal({
  open,
  title,
  steps,
  onClose,
  onFinish,
  finishLabel = '생성',
}: {
  open: boolean;
  title: string;
  steps: { label: string; content: ReactNode }[];
  onClose: () => void;
  onFinish?: () => void;
  finishLabel?: string;
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);
  if (!open) return null;
  const last = step === steps.length - 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="large"
      actions={
        <>
          {step > 0 && <Button onClick={() => setStep(step - 1)}>이전</Button>}
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (last) {
                onFinish?.();
                onClose();
              } else setStep(step + 1);
            }}
          >
            {last ? finishLabel : '다음'}
          </Button>
        </>
      }
    >
      <div className="pl-row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {steps.map((s, i) => (
          <Chip key={s.label} severity={i === step ? 'info' : i < step ? 'success' : 'neutral'}>
            {i + 1}. {s.label}
          </Chip>
        ))}
      </div>
      {steps[step].content}
    </Modal>
  );
}

/* ── 확인 모달 ────────────────────────── */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = '확인',
  destructive = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant={destructive ? 'secondary' : 'primary'}
            destructive={destructive}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
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

/** 키-값 정보 목록 (플라이오버/모달용) */
export function InfoList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <div className="pl-infolist">
      {rows.map((r) => (
        <div key={r.label} className="row">
          <span className="k">{r.label}</span>
          <span className="v">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** 키-값 상세 모달 (제네릭) */
export function DetailModal({
  title,
  rows,
  children,
  onClose,
}: {
  title: string;
  rows: { label: string; value: ReactNode }[];
  children?: ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={title} actions={<Button onClick={onClose}>닫기</Button>}>
      <div className="pl-stack">
        <InfoList rows={rows} />
        {children}
      </div>
    </Modal>
  );
}

/* ── 인포 툴팁 (ⓘ — 호버 시 설명) ─────── */
export function InfoTip({ children }: { children: ReactNode }) {
  return (
    <span className="pl-infotip">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-label="도움말">
        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 7.2v3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="4.9" r="0.8" fill="currentColor" />
      </svg>
      <span className="tip">{children}</span>
    </span>
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
