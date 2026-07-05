import { useEffect, useRef } from 'react';

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

export function AnimatedNumber({
  value,
  format = (current) => String(Math.round(current)),
  duration = 720,
}: {
  value: number;
  format?: (current: number) => string;
  duration?: number;
}) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const latestValue = useRef(value);

  useEffect(() => {
    const from = latestValue.current;
    const to = value;
    latestValue.current = value;

    if (from === to) {
      if (nodeRef.current) nodeRef.current.textContent = format(to);
      return undefined;
    }

    let frameId = 0;
    const start = performance.now();
    const amplitude = Math.min(Math.abs(to - from) * 0.08, Math.max(Math.abs(to) * 0.015, 0.8));

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = easeOutCubic(progress);
      const settlingWave = Math.sin(progress * Math.PI * 3) * amplitude * (1 - progress);
      if (nodeRef.current) nodeRef.current.textContent = format(from + (to - from) * eased + settlingWave);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      } else {
        if (nodeRef.current) nodeRef.current.textContent = format(to);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, format, value]);

  return <span ref={nodeRef}>{format(value)}</span>;
}
