import type { UnifiedFilterState } from "../filters/filterContract";
import type {
  ResourcesFilterCompleteness,
  ResourcesFilterSnapshot,
} from "./resourcesFilterContract";

export type ResourceMetricTimeRange = "15m" | "1h" | "6h" | "24h";

export interface ResourceMetricHistoryPoint {
  observedAt: string;
  cpuMillicores: number | null;
  memoryMebibytes: number | null;
}

export interface ResourceMetricHistorySeries {
  resourceId: string;
  clusterId: string;
  resourceType: "pod" | "node";
  namespace: string | null;
  name: string;
  points: ResourceMetricHistoryPoint[];
  hasSparklinePoints: boolean;
  completeness: ResourcesFilterCompleteness;
  partialReasonCodes: string[];
}

export interface ResourceMetricsHistoryBatch {
  series: ResourceMetricHistorySeries[];
  completeness: ResourcesFilterCompleteness;
  partialReasonCodes: string[];
  snapshot: ResourcesFilterSnapshot;
}

export interface ResourceMetricsHistoryOptions {
  snapshotRevision: number;
  range?: ResourceMetricTimeRange;
  limit?: number;
}

export interface ResourceMetricsHistoryPort {
  loadResourceMetricsHistory(
    state: UnifiedFilterState,
    resourceIds: string[],
    options: ResourceMetricsHistoryOptions,
    signal?: AbortSignal,
  ): Promise<ResourceMetricsHistoryBatch>;
}
