export const MOTION_DURATION_MS = {
  micro: 120,
  standard: 180,
  hierarchyMorph: 360,
  zoomableHierarchy: 750,
  loading: 800,
} as const;

export const MOTION_EASING = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.2, 0, 0, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export interface MotionRecipe {
  readonly duration: number;
  readonly ease: readonly [number, number, number, number];
}

/** Motion-compatible recipes use seconds; CSS mirrors the same values as custom properties. */
export const MOTION_RECIPE = {
  micro: {
    duration: MOTION_DURATION_MS.micro / 1_000,
    ease: MOTION_EASING.standard,
  },
  standard: {
    duration: MOTION_DURATION_MS.standard / 1_000,
    ease: MOTION_EASING.standard,
  },
  hierarchyMorph: {
    duration: MOTION_DURATION_MS.hierarchyMorph / 1_000,
    ease: MOTION_EASING.emphasized,
  },
  zoomableHierarchy: {
    duration: MOTION_DURATION_MS.zoomableHierarchy / 1_000,
    ease: MOTION_EASING.emphasized,
  },
  loading: {
    duration: MOTION_DURATION_MS.loading / 1_000,
    ease: MOTION_EASING.standard,
  },
} as const satisfies Record<keyof typeof MOTION_DURATION_MS, MotionRecipe>;
