import type { Transition } from "motion/react";

import { MOTION_DURATION_SECONDS } from "./useStagger";

export const MOTION_SPRING = Object.freeze({
  soft: Object.freeze({
    type: "spring",
    bounce: 0.12,
    visualDuration: 0.32,
  }),
  spring: Object.freeze({
    type: "spring",
    bounce: 0.16,
    visualDuration: 0.5,
  }),
  page: Object.freeze({
    type: "spring",
    bounce: 0.08,
    visualDuration: 0.55,
  }),
} satisfies Record<"page" | "soft" | "spring", Transition>);

export const EASE_DRAW = Object.freeze([0.22, 1, 0.36, 1] as const);

/** Tween-only exceptions from demo-freeze-v3; layout motion uses MOTION_SPRING. */
export const MOTION_TWEEN = Object.freeze({
  none: Object.freeze({ duration: MOTION_DURATION_SECONDS.none }),
  micro: Object.freeze({ duration: MOTION_DURATION_SECONDS.micro }),
  fade: Object.freeze({ duration: MOTION_DURATION_SECONDS.fade }),
  draw: Object.freeze({
    duration: MOTION_DURATION_SECONDS.draw,
    ease: EASE_DRAW,
  }),
  meter: Object.freeze({
    duration: MOTION_DURATION_SECONDS.meter,
    ease: "easeInOut",
  }),
  count: Object.freeze({
    duration: MOTION_DURATION_SECONDS.count,
    ease: "easeInOut",
  }),
} satisfies Record<"count" | "draw" | "fade" | "meter" | "micro" | "none", Transition>);

export const LIST_STAGGER = Object.freeze({
  maxItems: 8,
  seconds: 0.045,
});

export function listStaggerDelay(index: number, reducedMotion = false): number {
  if (reducedMotion) return 0;
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return Math.min(safeIndex, LIST_STAGGER.maxItems) * LIST_STAGGER.seconds;
}
