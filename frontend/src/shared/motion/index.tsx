// 모션 프리미티브 5종 — 인라인 animate 금지, 여기서만 (docs/fd/04 § 모션 원칙)
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
