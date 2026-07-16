export const COST_MICRO_UNIT = 1_000_000;

export type CostNumberFormatter = (
  value: number | bigint,
  options?: Intl.NumberFormatOptions,
) => string;

export function formatCostMicros(
  micros: number,
  currency: string,
  formatNumber: CostNumberFormatter,
): string {
  if (!Number.isSafeInteger(micros) || micros < 0) {
    throw new RangeError("Cost micro-units must be a non-negative safe integer");
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TypeError("Cost currency must be an ISO 4217 code");
  }
  const majorUnits = micros / COST_MICRO_UNIT;
  return formatNumber(majorUnits, {
    currency,
    maximumFractionDigits: majorUnits >= 1 ? 2 : 4,
    style: "currency",
  });
}

export function allocationUsePercent(basisPoints: number | null): number | null {
  if (basisPoints === null) return null;
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new RangeError("Allocation use basis points must be between zero and 10,000");
  }
  return basisPoints / 100;
}
