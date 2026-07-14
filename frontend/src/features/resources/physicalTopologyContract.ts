import type { UnifiedFilterState } from "../filters/filterContract";
import type {
  ResourcesFilterCompleteness,
  ResourcesFilterCounts,
  ResourcesFilterSnapshot,
} from "./resourcesFilterContract";

export interface PhysicalTopologyServer {
  id: string;
  name: string;
  cpuPercent: number | null;
  memoryPercent: number | null;
  status: string;
  matchedPodCount: number | null;
  totalPodCount: number | null;
  matchedPodCountCompleteness: ResourcesFilterCompleteness;
  totalPodCountCompleteness: ResourcesFilterCompleteness;
}

export interface PhysicalTopologyPod {
  id: string;
  name: string;
  namespace: string | null;
  serverId: string | null;
  usagePercent: number | null;
  cpuMillicores: number | null;
  memoryMebibytes: number | null;
  phase: string;
  health: string;
  restartCount: number;
  matchesFilter: boolean;
}

export interface PhysicalTopologySnapshot {
  clusterId: string;
  clusterProjectionRevision: number;
  servers: PhysicalTopologyServer[];
  pods: PhysicalTopologyPod[];
  truncatedByServer: Readonly<Record<string, number>>;
  unassignedTruncatedCount: number;
  counts: ResourcesFilterCounts;
  projectionCompleteness: ResourcesFilterCompleteness;
  metricsCompleteness: ResourcesFilterCompleteness;
  metricsObservedAt: string | null;
  partialReasonCodes: string[];
  snapshot: ResourcesFilterSnapshot;
}

export interface PhysicalTopologyOptions {
  snapshotRevision?: number;
}

export interface PhysicalTopologyPort {
  loadPhysicalTopology(
    state: UnifiedFilterState,
    options?: PhysicalTopologyOptions,
    signal?: AbortSignal,
  ): Promise<PhysicalTopologySnapshot>;
}
