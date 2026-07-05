import type { Transition, Variants } from 'motion/react';

export const studioTransition: Transition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1],
};

export const softSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

export const quickSpring: Transition = {
  type: 'spring',
  stiffness: 620,
  damping: 38,
  mass: 0.72,
};

export const cardHover = {
  y: -3,
  scale: 1.01,
};

export const cardTap = {
  scale: 0.985,
};

export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 'var(--motion-y, 10px)' },
  visible: { opacity: 1, y: 0 },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.03,
    },
  },
};

export const noteVariants: Variants = {
  hidden: { opacity: 0, x: 18, rotate: 0.6 },
  visible: (index: number = 0) => ({
    opacity: 1,
    x: 0,
    rotate: index % 2 ? -0.3 : 0.3,
  }),
  exit: { opacity: 0, x: 12, scale: 0.98 },
};
