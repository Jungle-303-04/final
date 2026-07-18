import type { Transition } from "motion/react";

export const MOTION_SPRING = Object.freeze({
  soft: Object.freeze({
    type: "spring",
    stiffness: 360,
    damping: 32,
    mass: 0.8,
  }),
  spring: Object.freeze({
    type: "spring",
    stiffness: 420,
    damping: 30,
    mass: 0.9,
  }),
  page: Object.freeze({
    type: "spring",
    stiffness: 300,
    damping: 34,
    mass: 1,
  }),
} satisfies Record<"page" | "soft" | "spring", Transition>);

export const EASE_DRAW = Object.freeze([0.32, 0.72, 0, 1] as const);

export const LIST_STAGGER = Object.freeze({
  maxItems: 8,
  seconds: 0.045,
});

export function listStaggerDelay(index: number, reducedMotion = false): number {
  if (reducedMotion) return 0;
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return Math.min(safeIndex, LIST_STAGGER.maxItems) * LIST_STAGGER.seconds;
}
