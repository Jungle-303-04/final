export function compareNullableMetricDesc(left: number | null, right: number | null): number {
  const leftMissingRank = left === null ? 1 : 0;
  const rightMissingRank = right === null ? 1 : 0;
  if (leftMissingRank !== rightMissingRank) return leftMissingRank - rightMissingRank;
  if (left === null || right === null) return 0;
  return right - left;
}

export function isFiniteMetric(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}
