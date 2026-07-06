// 모션 프리미티브 — 인라인 animate 금지, 여기서만 (docs/fd/04 § 모션 원칙)
import { motion, useReducedMotion, AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export { AnimatePresence };

export function FadeSlideIn({ children, delay = 0, dir = 'up' }: { children: ReactNode; delay?: number; dir?: 'up' | 'left' }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  const from = dir === 'up' ? { y: 8 } : { x: 8 };
  return (
    <motion.div initial={{ opacity: 0, ...from }} animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1], delay }}>
      {children}
    </motion.div>
  );
}

export function Stagger({ children }: { children: ReactNode[] }) {
  return <>{children.map((c, i) => <FadeSlideIn key={i} delay={Math.min(i, 8) * 0.04}>{c}</FadeSlideIn>)}</>;
}

export function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (reduced) { setShown(value); return; }
    const from = prev.current; prev.current = value;
    const t0 = performance.now(); const dur = 350;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setShown(Math.round(from + (value - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <span>{shown.toLocaleString()}</span>;
}

export function PressScale({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return <motion.div whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }} style={{ display: 'contents' }}>{children}</motion.div>;
}

export function LayoutMorph({ id, children }: { id: string; children: ReactNode }) {
  return <motion.div layoutId={id} transition={{ duration: 0.35, ease: [0.65, 0, 0.35, 1] }}>{children}</motion.div>;
}

/** 목록 layout 애니메이션 — 항목 추가/제거/재정렬 시 부드럽게 이동(키 기반) */
export function AnimatedList<T>({ items, getKey, children }: { items: T[]; getKey: (item: T) => string; children: (item: T) => ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{items.map(item => <div key={getKey(item)}>{children(item)}</div>)}</>;
  return (
    <AnimatePresence initial={false}>
      {items.map(item => (
        <motion.div key={getKey(item)} layout
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
          {children(item)}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

/** 테이블 행 layout 애니메이션 — ResourceTable 전용(AnimatedList 의 tr 변형) */
export function AnimatedRow({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const reduced = useReducedMotion();
  if (reduced) return <tr className={className} onClick={onClick}>{children}</tr>;
  return (
    <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className={className} onClick={onClick}>
      {children}
    </motion.tr>
  );
}

/** 짧은 pulse 트리거 — key 값이 바뀔 때마다 1회 반짝(라이브 수신 인디케이터용) */
export function PulseOnChange({ signal, children }: { signal: string | number | undefined; children: ReactNode }) {
  const reduced = useReducedMotion();
  const first = useRef(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (signal === undefined) return;
    if (first.current) { first.current = false; return; } // 최초 수신은 조용히
    setTick(t => t + 1);
  }, [signal]);
  if (reduced || tick === 0) return <span style={{ display: 'inline-flex', alignItems: 'center' }}>{children}</span>;
  return (
    <motion.span key={tick} initial={{ scale: 1.35, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {children}
    </motion.span>
  );
}
