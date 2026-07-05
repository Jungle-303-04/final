import { useEffect, useState } from 'react';

export function useRafPerformance(enabled: boolean) {
  const [fps, setFps] = useState(60);

  useEffect(() => {
    if (!enabled) return undefined;

    let frameId = 0;
    let last = performance.now();
    let elapsed = 0;
    let frames = 0;

    const loop = (now: number) => {
      const delta = now - last;
      last = now;

      if (document.visibilityState === 'hidden' || delta > 120) {
        elapsed = 0;
        frames = 0;
        frameId = window.requestAnimationFrame(loop);
        return;
      }

      elapsed += delta;
      frames += 1;

      if (elapsed >= 800) {
        setFps(Math.min(60, Math.round((frames * 10000) / elapsed) / 10));
        elapsed = 0;
        frames = 0;
      }

      frameId = window.requestAnimationFrame(loop);
    };

    frameId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameId);
  }, [enabled]);

  return fps;
}
