// 모션 토큰 (기획서 I12) — 모든 애니메이션 duration·easing의 단일 출처
// 하드코딩 금지: 컴포넌트는 반드시 이 토큰만 사용한다.
// prefers-reduced-motion은 앱 루트의 <MotionConfig reducedMotion="user">가 일괄 처리.
import type { Transition, Variants } from 'motion/react';

export const DUR = { fast: 0.12, base: 0.2, slow: 0.32 } as const;

export const EASE = {
  standard: [0.4, 0, 0.2, 1],
  decelerate: [0, 0, 0.2, 1],
} as const;

export const SPRING: Transition = { type: 'spring', stiffness: 380, damping: 32 };

/* ── 공통 문법 ─────────────────────────── */
/** 페이지/섹션 진입: fade + 8px rise */
export const fadeRise: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE.decelerate } },
};

/** 오버레이(모달 배경): fade */
export const overlayFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DUR.fast } },
  exit: { opacity: 0, transition: { duration: DUR.fast } },
};

/** 플라이오버: 오른쪽에서 슬라이드 인 */
export const flyoverSlide: Variants = {
  initial: { x: 48, opacity: 0 },
  animate: { x: 0, opacity: 1, transition: { duration: DUR.slow, ease: EASE.decelerate } },
  exit: { x: 48, opacity: 0, transition: { duration: DUR.fast } },
};

/** 모달 본체: 살짝 떠오르며 pop (오버레이는 overlayFade 와 조합) */
export const modalPop: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR.base, ease: EASE.decelerate } },
  exit: { opacity: 0, scale: 0.98, y: 6, transition: { duration: DUR.fast } },
};

/** 리스트/그리드 컨테이너: 자식 20ms 스태거 */
export const staggerParent: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.02 } },
};

export const staggerChild: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE.decelerate } },
};
