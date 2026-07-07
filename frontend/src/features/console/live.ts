// 라이브 더미 메트릭 — 다중 사인파 노이즈로 매 프레임(60fps) 연속 변화
import { useEffect, useRef, useState } from 'react';

/**
 * base 주변에서 끊김 없이 출렁이는 숫자.
 * 여러 주기의 사인파를 합성해 매 프레임 연속적인 값을 만든다 (목표점 점프 없음).
 */
export function useLiveValue(
  base: number,
  volatility: number,
  { min = 0, max = 100, decimals = 1 }: { min?: number; max?: number; decimals?: number } = {},
): number {
  const [value, setValue] = useState(base);
  const phase = useRef({
    p1: Math.random() * Math.PI * 2,
    p2: Math.random() * Math.PI * 2,
    p3: Math.random() * Math.PI * 2,
  });

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const { p1, p2, p3 } = phase.current;
      const noise =
        0.55 * Math.sin(t / 2300 + p1) + 0.3 * Math.sin(t / 830 + p2) + 0.15 * Math.sin(t / 310 + p3);
      const v = Math.max(min, Math.min(max, base + volatility * noise));
      setValue(Number(v.toFixed(decimals)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [base, volatility, min, max, decimals]);

  return value;
}

/**
 * 라이브 값을 일정 간격으로 샘플링해 오른쪽으로 흐르는 시계열 버퍼.
 * 샘플 간격이 짧아(기본 120ms) 차트가 끊김 없이 흐른다.
 */
export function useLiveStream(
  live: number,
  { sampleMs = 120, size = 100 }: { sampleMs?: number; size?: number } = {},
): number[] {
  const [series, setSeries] = useState<number[]>(() => Array.from({ length: size }, () => live));
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const id = setInterval(() => {
      setSeries((prev) => [...prev.slice(1), liveRef.current]);
    }, sampleMs);
    return () => clearInterval(id);
  }, [sampleMs]);

  return series;
}

/* ── 하위 호환 별칭 ── */
export const useLive = (
  base: number,
  volatility: number,
  opts: { min?: number; max?: number; periodMs?: number; decimals?: number } = {},
) => useLiveValue(base, volatility, { min: opts.min, max: opts.max, decimals: opts.decimals ?? 0 });

export function useLiveSeries(initial: number[], volatility: number): number[] {
  const base = initial[initial.length - 1] ?? 50;
  const live = useLiveValue(base, volatility, { decimals: 1 });
  return useLiveStream(live, { sampleMs: 120, size: initial.length * 2 });
}
