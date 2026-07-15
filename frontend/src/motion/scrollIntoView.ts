import { useCallback } from "react";

import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export type MotionAwareScrollIntoViewOptions = Omit<ScrollIntoViewOptions, "behavior"> & {
  behavior?: ScrollBehavior;
};

export interface ScrollIntoViewTarget {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
}

/**
 * Scrolls without changing focus. Smooth movement is an enhancement only:
 * users requesting reduced motion always receive an immediate scroll.
 */
export function scrollIntoViewWithMotionPreference(
  target: ScrollIntoViewTarget | null | undefined,
  options: MotionAwareScrollIntoViewOptions = {},
  reducedMotion = false,
): void {
  target?.scrollIntoView?.({
    ...options,
    behavior: reducedMotion ? "auto" : options.behavior ?? "smooth",
  });
}

export function useMotionAwareScrollIntoView(): (
  target: ScrollIntoViewTarget | null | undefined,
  options?: MotionAwareScrollIntoViewOptions,
) => void {
  const reducedMotion = usePrefersReducedMotion();
  return useCallback((target, options) => {
    scrollIntoViewWithMotionPreference(target, options, reducedMotion);
  }, [reducedMotion]);
}
