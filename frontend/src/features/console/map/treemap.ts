// 트리맵 레이아웃 — 이진 분할 방식 (결정적, 크기 불변 시 배치 불변 — I2)
// 크기(size)는 "규모" 값만 받는다. 상태(색)는 렌더러 몫 — 레이아웃과 분리.

export type TreeRect = { x: number; y: number; w: number; h: number };

/** size 내림차순 정렬 후 합이 비슷한 두 묶음으로 재귀 분할. 긴 축을 나눈다. */
export function layoutTreemap(
  items: { id: string; size: number }[],
  width: number,
  height: number,
): Map<string, TreeRect> {
  const out = new Map<string, TreeRect>();
  const sorted = [...items].filter((i) => i.size > 0).sort((a, b) => b.size - a.size);
  if (sorted.length === 0) return out;

  const split = (list: typeof sorted, rect: TreeRect) => {
    if (list.length === 0) return;
    if (list.length === 1) {
      out.set(list[0].id, rect);
      return;
    }
    const total = list.reduce((s, i) => s + i.size, 0);
    // 합이 절반에 가장 가까워지는 지점에서 자른다
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < list.length - 1; i++) {
      acc += list[i].size;
      if (acc >= total / 2) {
        cut = i + 1;
        break;
      }
      cut = i + 1;
    }
    const a = list.slice(0, cut);
    const b = list.slice(cut);
    const ratio = a.reduce((s, i) => s + i.size, 0) / total;
    if (rect.w >= rect.h) {
      const w = rect.w * ratio;
      split(a, { ...rect, w });
      split(b, { ...rect, x: rect.x + w, w: rect.w - w });
    } else {
      const h = rect.h * ratio;
      split(a, { ...rect, h });
      split(b, { ...rect, y: rect.y + h, h: rect.h - h });
    }
  };

  split(sorted, { x: 0, y: 0, w: width, h: height });
  return out;
}

/* ── 셀 라벨 가시성 임계값 (기획서 §1.4 — 매직넘버 금지, 여기가 단일 출처) ── */
export const LABEL_MIN = {
  nameW: 88, // 이름+값 표시 최소 폭
  nameH: 42,
  valueW: 52, // 값만 표시 최소 폭
  valueH: 26,
};

export type LabelMode = 'full' | 'value' | 'none';

export function labelMode(w: number, h: number): LabelMode {
  if (w >= LABEL_MIN.nameW && h >= LABEL_MIN.nameH) return 'full';
  if (w >= LABEL_MIN.valueW && h >= LABEL_MIN.valueH) return 'value';
  return 'none';
}
