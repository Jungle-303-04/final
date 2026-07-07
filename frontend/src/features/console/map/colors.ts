// 히트맵 색 스케일 — L0/L1/L2 공용
// 렌즈별 전용 색상 (토큰은 map.css의 --map-*이 단일 출처):
//   전체(건강) = 초록↔빨강 상태색 · CPU = 시안 · 메모리 = 보라 · 비용 = 파랑
// 위험 상황(고사용률·NotReady·CrashLoop)은 렌즈와 무관하게 빨강으로 수렴한다.

/** 강도 램프: 토큰 색을 사용률(0~100)만큼 진하게 */
function ramp(token: string, pct: number, min = 16, max = 78): string {
  const x = Math.round(min + (Math.max(0, Math.min(100, pct)) / 100) * (max - min));
  return `color-mix(in srgb, var(${token}) ${x}%, var(--color-fill-two))`;
}

export function healthColor(health: number): string {
  if (health >= 70)
    return `color-mix(in srgb, var(--color-text-success) ${Math.round(28 + (health - 70) * 0.9)}%, var(--color-fill-two))`;
  if (health >= 50) return `color-mix(in srgb, var(--color-text-warning) 42%, var(--color-fill-two))`;
  return `color-mix(in srgb, var(--color-text-danger) ${Math.round(38 + (50 - health))}%, var(--color-fill-two))`;
}

/** CPU 사용률 — 시안 램프, 90% 이상은 위험색으로 수렴 */
export function cpuColor(p: number): string {
  if (p >= 90) return `color-mix(in srgb, var(--color-text-danger) ${Math.round(45 + (p - 90))}%, var(--color-fill-two))`;
  return ramp('--map-cpu', p);
}

/** 메모리 사용률 — 보라 램프, 90% 이상은 위험색으로 수렴 */
export function memColor(p: number): string {
  if (p >= 90) return `color-mix(in srgb, var(--color-text-danger) ${Math.round(45 + (p - 90))}%, var(--color-fill-two))`;
  return ramp('--map-mem', p);
}

/** 비용 증감(%) — 파랑(감소)↔빨강(증가) */
export function deltaColor(d: number): string {
  if (d <= 0) return `color-mix(in srgb, var(--map-cost) ${Math.round(20 + Math.min(Math.abs(d) * 4, 45))}%, var(--color-fill-two))`;
  return `color-mix(in srgb, var(--color-text-danger) ${Math.round(18 + Math.min(d * 4, 50))}%, var(--color-fill-two))`;
}

/** 비용 점유율(0~1) — 파랑 강도 (그룹/팟 레벨: 증감이 없으므로 점유율이 색) */
export function shareColor(share: number): string {
  return `color-mix(in srgb, var(--map-cost) ${Math.round(16 + Math.min(share * 220, 62))}%, var(--color-fill-two))`;
}

/** 위험 강조(NotReady·CrashLoop 등) — 렌즈 무관 */
export const dangerCell = 'color-mix(in srgb, var(--color-text-danger) 56%, var(--color-fill-two))';

export const fmtCost = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`);
