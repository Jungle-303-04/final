import { AnimatePresence, type Transition, type Variants } from 'motion/react';

export { AnimatePresence };

export const durations = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
} as const;

export const easing = {
  standard: [0.4, 0, 0.2, 1],
  decelerate: [0, 0, 0.2, 1],
  emphasized: [0.16, 1, 0.3, 1],
} as const;

export const transitions = {
  fast: { duration: durations.fast, ease: easing.standard },
  base: { duration: durations.base, ease: easing.decelerate },
  slow: { duration: durations.slow, ease: easing.decelerate },
  spring: { type: 'spring', stiffness: 420, damping: 34 },
} satisfies Record<string, Transition>;

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transitions.base },
  exit: { opacity: 0, y: 4, transition: transitions.fast },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: transitions.base },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: transitions.fast },
};

export const listStagger: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
};

export const listItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: transitions.base },
  exit: { opacity: 0, y: 4, transition: transitions.fast },
};

export const drawerSlide: Variants = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0, transition: transitions.slow },
  exit: { opacity: 0, x: 40, transition: transitions.fast },
};

export const collapse: Variants = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto', transition: transitions.base },
  exit: { opacity: 0, height: 0, transition: transitions.fast },
};

export const overlayFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transitions.fast },
  exit: { opacity: 0, transition: transitions.fast },
};
