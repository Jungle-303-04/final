import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const MILLISECONDS_PER_SECOND = 1_000;

/**
 * demo-freeze-v3 motion durations. Keep aliases below for existing product
 * consumers, but add new motion by semantic intent (micro/fade/draw/meter/count
 * or soft/spring/page) instead of inventing another timing.
 */
const DEMO_V3_DURATION_MS = Object.freeze({
  micro: 120,
  fade: 180,
  draw: 850,
  meter: 1_200,
  count: 1_400,
  soft: 320,
  spring: 500,
  page: 550,
});

export const MOTION_DURATION_MS = Object.freeze({
  none: 0,
  ...DEMO_V3_DURATION_MS,
  // Compatibility aliases for product surfaces that predate demo-freeze-v3.
  instant: DEMO_V3_DURATION_MS.micro,
  quick: DEMO_V3_DURATION_MS.fade,
  pop: DEMO_V3_DURATION_MS.soft,
  layout: DEMO_V3_DURATION_MS.spring,
  camera: DEMO_V3_DURATION_MS.page,
  value: DEMO_V3_DURATION_MS.draw,
});

export const MOTION_DURATION_SECONDS = Object.freeze({
  none: MOTION_DURATION_MS.none / MILLISECONDS_PER_SECOND,
  micro: MOTION_DURATION_MS.micro / MILLISECONDS_PER_SECOND,
  fade: MOTION_DURATION_MS.fade / MILLISECONDS_PER_SECOND,
  draw: MOTION_DURATION_MS.draw / MILLISECONDS_PER_SECOND,
  meter: MOTION_DURATION_MS.meter / MILLISECONDS_PER_SECOND,
  count: MOTION_DURATION_MS.count / MILLISECONDS_PER_SECOND,
  soft: MOTION_DURATION_MS.soft / MILLISECONDS_PER_SECOND,
  spring: MOTION_DURATION_MS.spring / MILLISECONDS_PER_SECOND,
  page: MOTION_DURATION_MS.page / MILLISECONDS_PER_SECOND,
  instant: MOTION_DURATION_MS.instant / MILLISECONDS_PER_SECOND,
  quick: MOTION_DURATION_MS.quick / MILLISECONDS_PER_SECOND,
  pop: MOTION_DURATION_MS.pop / MILLISECONDS_PER_SECOND,
  layout: MOTION_DURATION_MS.layout / MILLISECONDS_PER_SECOND,
  camera: MOTION_DURATION_MS.camera / MILLISECONDS_PER_SECOND,
  value: MOTION_DURATION_MS.value / MILLISECONDS_PER_SECOND,
});

export const STAGGER_MS = Object.freeze({
  node: 70,
  pod: 32,
  row: 18,
  suggestion: 35,
  max: 520,
});

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a finite non-negative number`);
  }
  return value;
}

export function staggerDelay(
  index: number,
  stepMs: number,
  maxMs = STAGGER_MS.max,
): number {
  const safeIndex = Math.floor(finiteNonNegative(index, "index"));
  const safeStep = finiteNonNegative(stepMs, "stepMs");
  const safeMax = finiteNonNegative(maxMs, "maxMs");
  return Math.min(safeIndex * safeStep, safeMax);
}

export function podWaveDelay(nodeIndex: number, podIndex: number): number {
  const nodeDelay = staggerDelay(nodeIndex, STAGGER_MS.node);
  const podDelay = staggerDelay(podIndex, STAGGER_MS.pod);
  return Math.min(nodeDelay + podDelay, STAGGER_MS.max);
}

export function useStagger(index: number, stepMs: number): number {
  const reducedMotion = usePrefersReducedMotion();
  return reducedMotion ? 0 : staggerDelay(index, stepMs);
}
