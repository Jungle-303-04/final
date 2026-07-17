import type { CostWorkloadAllocation } from "./costContract";
import type { CostWorkloadAllocationEndpoint } from "./costEndpointContract";

export function toCostWorkloadAllocation(
  cost: CostWorkloadAllocationEndpoint,
): CostWorkloadAllocation {
  if (cost.availability === "unavailable") {
    return { availability: "unavailable", reasonCodes: [...cost.reason_codes] };
  }
  return {
    availability: cost.availability,
    observedAt: cost.observed_at,
    currency: cost.currency,
    current: {
      replicas: cost.current.replicas,
      hourlyRateMicros: cost.current.hourly_rate_micros,
      projectedDailyMicros: cost.current.projected_daily_micros,
      projectedMonthlyMicros: cost.current.projected_monthly_micros,
      cpuRateMicros: cost.current.cpu_rate_micros,
      memoryRateMicros: cost.current.memory_rate_micros,
      cpuAllocationUseBasisPoints: cost.current.cpu_allocation_use_basis_points,
      memoryAllocationUseBasisPoints: cost.current.memory_allocation_use_basis_points,
      cpuUsageWindowSeconds: cost.current.cpu_usage_window_seconds,
      memoryUsageWindowSeconds: cost.current.memory_usage_window_seconds,
    },
    trend: cost.trend.availability === "unavailable" ? {
      availability: "unavailable",
      timeRange: cost.trend.range,
      currency: null,
      series: [],
      reasonCodes: [...cost.trend.reason_codes],
    } : {
      availability: cost.trend.availability,
      timeRange: cost.trend.range,
      currency: cost.trend.currency,
      series: cost.trend.series.map((series) => ({
        key: series.key,
        label: series.label,
        points: series.points.map((point) => ({
          timestamp: point.timestamp,
          rateMicros: point.rate_micros,
        })),
      })),
      reasonCodes: [...cost.trend.reason_codes],
    },
    reasonCodes: [...cost.reason_codes],
  };
}
