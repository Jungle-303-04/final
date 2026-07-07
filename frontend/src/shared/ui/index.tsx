// 공용 프리미티브 — docs/fd/04 인벤토리. 뷰는 이 모듈과 motion 만 사용
import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ApiError } from '@/shared/lib/api';
import type { Tone } from '@/shared/lib/types';
import { toneColor, toneOf } from '@/shared/ui/status';
import { AnimatePresence, AnimatedRow, CountUp } from '@/shared/motion';
import { flyoverSlide, modalPop, overlayFade } from '@/plural-ui/motion';
import { uiStore } from '@/shared/lib/ui-store';
import { IconAlertTriangle, IconFile, IconX } from '@/shared/ui/icons';

export function Button({ variant = 'secondary', size, loading, children, className, ...rest }:
  { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm'; loading?: boolean } &
  React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`btn btn--${variant} ${size ? `btn--${size}` : ''} ${className ?? ''}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? '…' : children}
    </button>
  );
}

export function Badge({ status, tone, children }: { status?: string; tone?: Tone; children?: ReactNode }) {
  const t = tone ?? toneOf(status ?? '');
  return <span className="badge" style={{ color: toneColor(t) }}><span className="dot" />{children ?? status}</span>;
}

export function Card({ title, actions, children, style }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={style}>
      {(title || actions) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
          <strong style={{ fontSize: 'var(--fs-md)' }}>{title}</strong><div>{actions}</div>
        </div>
      )}
      {children}
    </div>
  );
}

export function StatBox({ label, value, tone }: { label: string; value: number; tone?: Tone }) {
  return <div className="statbox"><b style={tone ? { color: toneColor(tone) } : undefined}><CountUp value={value} /></b><span>{label}</span></div>;
}

export interface Column<T> { key: string; label: string; render: (row: T) => ReactNode; width?: string }
export function ResourceTable<T>({ columns, rows, rowKey, onRowClick, empty }:
  { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: ReactNode }) {
  if (rows.length === 0) return <>{empty ?? <EmptyState icon={<IconFile size={26} />} title="데이터가 없습니다" />}</>;
  return (
    <div className="table-scroll">{/* 좁은 화면에서 열 압착 대신 가로 스크롤 */}
      <table className="table">
        <thead><tr>{columns.map(c => <th key={c.key} style={{ width: c.width }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {/* 행 추가/제거/재정렬 시 layout 애니메이션(키 기반) */}
          <AnimatePresence initial={false}>
            {rows.map(r => (
              <AnimatedRow key={rowKey(r)} className={onRowClick ? 'clickable' : ''} onClick={() => onRowClick?.(r)}>
                {columns.map(c => <td key={c.key}>{c.render(r)}</td>)}
              </AnimatedRow>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

export function Tabs({ items, current, onChange }: { items: { key: string; label: string; badge?: number }[]; current: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(i => (
        <button key={i.key} role="tab" aria-selected={current === i.key} className={current === i.key ? 'active' : ''} onClick={() => onChange(i.key)}>
          {i.label}{i.badge ? ` (${i.badge})` : ''}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, onClose, children, size }: { open: boolean; title: string; onClose: () => void; children: ReactNode; size?: 'lg' }) {
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" variants={overlayFade} initial="initial" animate="animate" exit="exit" onClick={onClose}>
          <motion.div className={`modal ${size ? `modal--${size}` : ''}`} variants={modalPop}
            ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
              <strong style={{ fontSize: 'var(--fs-lg)' }}>{title}</strong>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="닫기" title="닫기" className="btn--icon"><IconX size={16} /></Button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({ open, title, onClose, children }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const drawerRef = useDialogFocus<HTMLElement>(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="drawer-backdrop" className="modal-backdrop" style={{ justifyContent: 'flex-end', background: 'rgb(0 0 0 / .35)' }}
            variants={overlayFade} initial="initial" animate="animate" exit="exit" onClick={onClose} />
          <motion.aside key="drawer" className="drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="상세" tabIndex={-1}
            variants={flyoverSlide} initial="initial" animate="animate" exit="exit">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
              <strong style={{ fontSize: 'var(--fs-lg)' }}>{title}</strong>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="닫기" title="닫기" className="btn--icon"><IconX size={16} /></Button>
            </div>
            {children}
          </motion.aside>
        </>
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

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return <div className="empty"><span className="ico">{icon}</span><strong>{title}</strong>{description && <span style={{ fontSize: 'var(--fs-sm)' }}>{description}</span>}{action}</div>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />)}</div>;
}

export function QueryBoundary<T>({ query, children, skeletonLines }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; skeletonLines?: number }) {
  if (query.isPending) return <Skeleton lines={skeletonLines ?? 4} />;
  if (query.isError) {
    const e = query.error as unknown as ApiError;
    const msg = e.kind === 'forbidden' ? '접근 권한이 없습니다' : e.kind === 'unauthorized' ? '다시 로그인해주세요' : e.kind === 'network' ? '네트워크 오류' : e.detail || '오류가 발생했습니다';
    return <EmptyState icon={<IconAlertTriangle size={26} />} title={msg} action={<Button size="sm" onClick={() => query.refetch()}>다시 시도</Button>} />;
  }
  return <>{children(query.data)}</>;
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <div className="field"><label>{label}</label>{children}{error && <span className="err" role="alert">{error}</span>}</div>;
}

export function KeyValue({ pairs }: { pairs: [string, ReactNode][] }) {
  return <dl className="kv">{pairs.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

// 클립보드 복사 — 실패(비보안 컨텍스트 등)까지 정직하게 알린다
export function copyToClipboard(text: string, label = '복사되었습니다') {
  navigator.clipboard.writeText(text)
    .then(() => uiStore.getState().toast('ok', label))
    .catch(() => uiStore.getState().toast('danger', '복사 실패 — 브라우저 권한을 확인해주세요'));
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="code">
      <Button size="sm" variant="ghost" style={{ position: 'absolute', top: 6, right: 6 }} onClick={() => copyToClipboard(code)}>복사</Button>
      {code}
    </div>
  );
}

/** 복사 가능한 식별자 칩 — correlation id 등 (클릭 시 클립보드 + 토스트) */
export function CopyChip({ value, display }: { value: string; display?: string }) {
  return (
    <button type="button" className="copychip" title={`${value} — 클릭해서 복사`}
      onClick={() => copyToClipboard(value)}>
      <code>{display ?? value}</code><span aria-hidden>⧉</span>
    </button>
  );
}

export function Avatar({ name }: { name: string }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return <span className="avatar" title={name} style={{ background: `oklch(75% 0.14 ${hue})` }}>{name.slice(0, 2).toUpperCase()}</span>;
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="breadcrumb">
      {items.map((i, n) => (
        <span key={n} style={{ display: 'flex', gap: 6 }}>
          {n > 0 && <span>/</span>}
          {i.to ? <Link to={i.to}>{i.label}</Link> : <span style={{ color: 'var(--text-1)' }}>{i.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return <div className="stepper">{steps.map((s, i) => <div key={s} className={`step ${i < current ? 'done' : i === current ? 'now' : ''}`}>{i + 1}. {s}</div>)}</div>;
}

export function Toasts() {
  const toasts = uiStore(s => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {/* 진입 slide-up + 자동 소멸 fade — MotionConfig(reducedMotion="user") 존중 */}
      <AnimatePresence initial={false}>
        {toasts.map(t => (
          <motion.div key={t.id} layout className="toast" style={{ borderLeftColor: toneColor(t.tone as Tone) }}
            initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
            {t.title}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return <input ref={ref} className="input" style={{ maxWidth: 320 }} value={value} placeholder={placeholder ?? '검색 ( / )'} onChange={e => onChange(e.target.value)} />;
}

export function useSearchFilter<T>(rows: T[], pick: (r: T) => string): [T[], string, (v: string) => void] {
  const [q, setQ] = useState('');
  const filtered = q ? rows.filter(r => pick(r).toLowerCase().includes(q.toLowerCase())) : rows;
  return [filtered, q, setQ];
}
