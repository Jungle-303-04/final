import type { MessageKey } from "../../shared/i18n";
import type {
  RightsizingAction,
  RightsizingMetric,
  RightsizingQuantity,
  RightsizingSignal,
} from "./rightsizingContract";

export type RightsizingTone = "critical" | "warning" | "healthy" | "unknown";

export function rightsizingActionPresentation(action: RightsizingAction): {
  key: MessageKey;
  tone: RightsizingTone;
} {
  const presentations = {
    increase: { key: "rightsizing.action.increase", tone: "warning" },
    reduction: { key: "rightsizing.action.reduction", tone: "unknown" },
    review: { key: "rightsizing.action.review", tone: "warning" },
    in_range: { key: "rightsizing.action.in_range", tone: "healthy" },
    need_data: { key: "rightsizing.action.need_data", tone: "unknown" },
  } as const;
  return presentations[action];
}

export function rightsizingFitKey(fit: RightsizingMetric["fit"]): MessageKey {
  return `rightsizing.fit.${fit}`;
}

export function rightsizingSignalKey(signal: RightsizingSignal): MessageKey {
  return `rightsizing.signal.${signal}`;
}

export function formatRightsizingQuantity(
  quantity: RightsizingQuantity | null,
  formatNumber: (value: number | bigint) => string,
  unset: string,
): string {
  if (quantity === null) return unset;
  return quantity.unit === "millicores"
    ? `${formatNumber(quantity.value)} mCPU`
    : `${formatNumber(quantity.value)} bytes`;
}
