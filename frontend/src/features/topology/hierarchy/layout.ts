import type { MetricValue } from "../contracts";

export type LayoutRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type WeightedItem<T> = {
  readonly key: string;
  readonly weight: number;
  readonly value: T;
};

export type PositionedItem<T> = WeightedItem<T> & {
  readonly rect: LayoutRect;
  readonly layoutRole: "weighted" | "residual";
};

export function metricMagnitude(value: MetricValue | undefined): number | null {
  if (value === undefined || value.valueDecimal === null) return null;
  const parsed = Number(value.valueDecimal);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function findBalancedSplit<T>(items: readonly WeightedItem<T>[]): number {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let prefix = 0;
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    if (previous === undefined) continue;
    prefix += previous.weight;
    const distance = Math.abs(total / 2 - prefix);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function layoutRange<T>(
  items: readonly WeightedItem<T>[],
  rect: LayoutRect,
): readonly (WeightedItem<T> & { readonly rect: LayoutRect })[] {
  if (items.length === 0) return [];
  const only = items[0];
  if (items.length === 1 && only !== undefined) return [{ ...only, rect }];

  const splitIndex = findBalancedSplit(items);
  const before = items.slice(0, splitIndex);
  const after = items.slice(splitIndex);
  const beforeWeight = before.reduce((sum, item) => sum + item.weight, 0);
  const totalWeight = beforeWeight + after.reduce((sum, item) => sum + item.weight, 0);
  const ratio = totalWeight > 0 ? beforeWeight / totalWeight : before.length / items.length;

  if (rect.width >= rect.height) {
    const beforeWidth = rect.width * ratio;
    return [
      ...layoutRange(before, { ...rect, width: beforeWidth }),
      ...layoutRange(after, {
        x: rect.x + beforeWidth,
        y: rect.y,
        width: rect.width - beforeWidth,
        height: rect.height,
      }),
    ];
  }

  const beforeHeight = rect.height * ratio;
  return [
    ...layoutRange(before, { ...rect, height: beforeHeight }),
    ...layoutRange(after, {
      x: rect.x,
      y: rect.y + beforeHeight,
      width: rect.width,
      height: rect.height - beforeHeight,
    }),
  ];
}

export function binaryTreemap<T>(
  items: readonly WeightedItem<T>[],
  rect: LayoutRect = { x: 0, y: 0, width: 100, height: 100 },
): readonly PositionedItem<T>[] {
  const positive = items
    .filter((item) => Number.isFinite(item.weight) && item.weight > 0)
    .slice()
    .sort((left, right) => left.key.localeCompare(right.key));

  return positive.length === 0
    ? []
    : layoutRange(positive, rect).map((item) => ({
        ...item,
        layoutRole: "weighted" as const,
      }));
}

function residualRail<T>(
  items: readonly WeightedItem<T>[],
  rect: LayoutRect,
): readonly PositionedItem<T>[] {
  if (items.length === 0) return [];
  const cellWidth = rect.width / items.length;
  return items.map((item, index) => ({
    ...item,
    rect: {
      x: rect.x + cellWidth * index,
      y: rect.y,
      width: cellWidth,
      height: rect.height,
    },
    layoutRole: "residual" as const,
  }));
}

/**
 * Zero and unavailable values have no quantitative area. They stay visible in
 * a residual rail instead of receiving a fabricated positive weight or being
 * removed from the map.
 */
export function treemapWithResidual<T>(
  items: readonly WeightedItem<T>[],
  rect: LayoutRect = { x: 0, y: 0, width: 100, height: 100 },
): readonly PositionedItem<T>[] {
  const ordered = items
    .slice()
    .sort((left, right) => left.key.localeCompare(right.key));
  const weighted = ordered.filter(
    (item) => Number.isFinite(item.weight) && item.weight > 0,
  );
  const residual = ordered.filter(
    (item) => !Number.isFinite(item.weight) || item.weight <= 0,
  );

  if (residual.length === 0) {
    return layoutRange(weighted, rect).map((item) => ({
      ...item,
      layoutRole: "weighted" as const,
    }));
  }

  if (weighted.length === 0) return residualRail(residual, rect);

  const railRatio = Math.min(0.22, Math.max(0.12, residual.length * 0.035));
  const weightedHeight = rect.height * (1 - railRatio);
  const weightedRect = { ...rect, height: weightedHeight };
  const railRect = {
    x: rect.x,
    y: rect.y + weightedHeight,
    width: rect.width,
    height: rect.height - weightedHeight,
  };

  return [
    ...layoutRange(weighted, weightedRect).map((item) => ({
      ...item,
      layoutRole: "weighted" as const,
    })),
    ...residualRail(residual, railRect),
  ];
}

export function insetRect(rect: LayoutRect, inset: number): LayoutRect {
  const clamped = Math.max(0, Math.min(inset, rect.width / 2, rect.height / 2));
  return {
    x: rect.x + clamped,
    y: rect.y + clamped,
    width: Math.max(0, rect.width - clamped * 2),
    height: Math.max(0, rect.height - clamped * 2),
  };
}

export function rectStyle(rect: LayoutRect) {
  return {
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
  } as const;
}
