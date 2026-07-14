import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";

export const USAGE_SMOOTHING_TAU_MS = 250;
export const MAX_ALWAYS_ANIMATED_USAGE_MARKS = 200;

const visibilityLimitedContext = createContext(false);

export function UsageSmoothingBoundary({
  children,
  markCount,
}: {
  children: ReactNode;
  markCount: number;
}) {
  return (
    <visibilityLimitedContext.Provider
      value={markCount > MAX_ALWAYS_ANIMATED_USAGE_MARKS}
    >
      {children}
    </visibilityLimitedContext.Provider>
  );
}

export function useSmoothedUsageColor(
  target: number | null,
  elementRef: RefObject<Element | null>,
): number | null {
  const reducedMotion = usePrefersReducedMotion();
  const visibilityLimited = useContext(visibilityLimitedContext);
  const canObserveVisibility = visibilityLimited &&
    typeof IntersectionObserver !== "undefined";
  const [intersecting, setIntersecting] = useState(false);
  const visible = !canObserveVisibility || intersecting;
  const [current, setCurrent] = useState<number | null>(target);
  const currentRef = useRef<number | null>(target);
  const targetRef = useRef<number | null>(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canObserveVisibility) return undefined;
    const element = elementRef.current;
    if (element === null) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setIntersecting(entry?.isIntersecting === true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [canObserveVisibility, elementRef]);

  useEffect(() => {
    targetRef.current = target;
    cancelFrame();
    if (target === null) return undefined;
    if (
      reducedMotion ||
      currentRef.current === null ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      commit(target);
      return undefined;
    }
    if (Math.abs(currentRef.current - target) < 0.05) return undefined;
    if (!visible) return undefined;

    let lastTimestamp: number | null = null;
    const animate = (timestamp: number) => {
      const latestTarget = targetRef.current;
      const latestCurrent = currentRef.current;
      if (latestTarget === null || latestCurrent === null) return;
      const elapsed = lastTimestamp === null ? 0 : Math.max(0, timestamp - lastTimestamp);
      lastTimestamp = timestamp;
      const next = exponentialUsageStep(latestCurrent, latestTarget, elapsed);
      if (Math.abs(next - latestTarget) < 0.05) {
        commit(latestTarget);
        frameRef.current = null;
        return;
      }
      commit(next);
      frameRef.current = window.requestAnimationFrame(animate);
    };
    frameRef.current = window.requestAnimationFrame(animate);
    return cancelFrame;
  }, [reducedMotion, target, visible]);

  useEffect(() => cancelFrame, []);
  return current;

  function commit(value: number) {
    currentRef.current = value;
    setCurrent(value);
  }

  function cancelFrame() {
    if (frameRef.current === null) return;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }
}

export function exponentialUsageStep(
  current: number,
  target: number,
  elapsedMs: number,
): number {
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / USAGE_SMOOTHING_TAU_MS);
  return current + (target - current) * alpha;
}

export function usageColor(value: number): string {
  const usage = Math.max(0, Math.min(value, 100));
  const neutral = "color-mix(in oklch, var(--muted-foreground) 38%, var(--muted))";
  if (usage <= 60) return neutral;
  if (usage <= 80) {
    const warningWeight = (usage - 60) * 5;
    return `color-mix(in oklch, ${neutral} ${100 - warningWeight}%, var(--status-warning) ${warningWeight}%)`;
  }
  const dangerWeight = (usage - 80) * 5;
  return `color-mix(in oklch, var(--status-warning) ${100 - dangerWeight}%, var(--destructive) ${dangerWeight}%)`;
}
