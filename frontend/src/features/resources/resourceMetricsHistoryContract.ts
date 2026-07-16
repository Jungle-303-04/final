import type { UnifiedFilterState } from "../filters/filterContract";
import type {
  ResourcesFilterCompleteness,
  ResourcesFilterSnapshot,
} from "./resourcesFilterContract";
import type { ResourceSummary } from "./resourcesContract";

export type ResourceMetricTimeRange = "15m" | "1h" | "6h" | "24h";
export type ResourceMetricsRefreshPolicyKey =
  | "metrics_kubernetes"
  | "metrics_prometheus"
  | "metrics_pvc"
  | "metrics_rightsizing";
export type ResourcesRefreshPolicyKey =
  | "changes"
  | "resource_list"
  | "resource_list_slow"
  | ResourceMetricsRefreshPolicyKey;
export type ResourceMetricSource = "kubernetes" | "prometheus";
export type ResourceMetricFreshness = "live" | "stale" | "partial" | "disconnected";

export interface ResourceMetricHistoryPoint {
  observedAt: string;
  cpuMillicores: number | null;
  memoryMebibytes: number | null;
  volumeUsagePercent?: number | null;
  networkReceiveBytesPerSecond?: number | null;
  networkTransmitBytesPerSecond?: number | null;
  filesystemBytes?: number | null;
  restartCount?: number | null;
  hpaCurrentReplicas?: number | null;
  hpaDesiredReplicas?: number | null;
}

export interface ResourceMetricCurrentObservation {
  observedAt: string;
  measurementWindow: string;
  cpuMillicores: number | null;
  memoryMebibytes: number | null;
  containers: ResourceMetricContainerObservation[];
  containerMetricsComplete: boolean;
}

export interface ResourceMetricContainerObservation {
  name: string;
  cpuMillicores: number | null;
  memoryMebibytes: number | null;
}

export interface ResourceMetricContainerHistorySeries {
  name: string;
  points: ResourceMetricHistoryPoint[];
  completeness: ResourcesFilterCompleteness;
  partialReasonCodes: string[];
}

export interface ResourceMetricHistorySeries {
  resourceId: string;
  clusterId: string;
  resourceType: "pod" | "node" | "pvc" | "hpa";
  namespace: string | null;
  name: string;
  points: ResourceMetricHistoryPoint[];
  references?: {
    cpuRequestMillicores: number | null;
    cpuLimitMillicores: number | null;
    memoryRequestMebibytes: number | null;
    memoryLimitMebibytes: number | null;
  };
  currentObservation?: ResourceMetricCurrentObservation | null;
  containerSeries?: ResourceMetricContainerHistorySeries[];
  containerHistoryCompleteness?: ResourcesFilterCompleteness;
  containerHistoryReasonCodes?: string[];
  hasSparklinePoints: boolean;
  completeness: ResourcesFilterCompleteness;
  partialReasonCodes: string[];
  source?: ResourceMetricSource;
  freshness?: ResourceMetricFreshness;
}

export interface ResourceMetricsHistoryBatch {
  refreshPolicyKey: ResourceMetricsRefreshPolicyKey;
  series: ResourceMetricHistorySeries[];
  completeness: ResourcesFilterCompleteness;
  partialReasonCodes: string[];
  snapshot: ResourcesFilterSnapshot;
  source?: ResourceMetricSource;
  sourceFreshness?: ResourceMetricFreshness;
}

export interface ResourceMetricsHistoryOptions {
  snapshotRevision: number;
  range?: ResourceMetricTimeRange;
  limit?: number;
}

export interface ScopedResourceMetricsObservation {
  series: ResourceMetricHistorySeries | null;
  completeness: ResourcesFilterCompleteness;
  partialReasonCodes: string[];
  refreshPolicyKey: "metrics_prometheus" | "metrics_pvc";
  source: "prometheus";
  freshness: ResourceMetricFreshness;
}

export interface ResourceMetricsHistoryPort {
  loadResourceMetricsHistory(
    state: UnifiedFilterState,
    resourceIds: string[],
    options: ResourceMetricsHistoryOptions,
    signal?: AbortSignal,
  ): Promise<ResourceMetricsHistoryBatch>;
  loadScopedResourceMetrics?(
    resource: ResourceSummary,
    range: ResourceMetricTimeRange,
    signal?: AbortSignal,
  ): Promise<ScopedResourceMetricsObservation>;
}
