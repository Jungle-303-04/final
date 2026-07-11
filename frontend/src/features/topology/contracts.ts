export type DataOrigin =
  | { readonly kind: "live"; readonly adapterId: string }
  | {
      readonly kind: "synthetic";
      readonly adapterId: string;
      readonly datasetId: string;
      readonly seed: string;
    };

export type HealthLevel =
  | "healthy"
  | "neutral"
  | "degraded"
  | "unhealthy"
  | "unknown";

export type MetricValue =
  | {
      readonly state: "value";
      readonly valueDecimal: string;
      readonly unitId: string;
    }
  | {
      readonly state: "zero";
      readonly valueDecimal: "0";
      readonly unitId: string;
    }
  | {
      readonly state: "missing" | "forbidden" | "unsupported";
      readonly valueDecimal: null;
      readonly unitId: string;
      readonly reason: string;
    };

export type AreaMetricDescriptor = {
  readonly metricId: string;
  readonly label: string;
  readonly unitId: string;
  readonly additive: true;
  readonly order: number;
};

export type TopologyEntityBase = {
  readonly entityKey: string;
  readonly displayName: string;
  readonly health: HealthLevel;
  readonly healthReason: string;
  readonly metrics: Readonly<Record<string, MetricValue>>;
};

export type PodTopologyEntity = TopologyEntityBase & {
  readonly kind: "pod";
  readonly resourceUid: string;
  readonly namespace: string;
  readonly phase: string;
};

export type NodeTopologyEntity = TopologyEntityBase & {
  readonly kind: "node";
  readonly resourceUid: string;
  readonly pods: readonly PodTopologyEntity[];
};

export type ClusterTopologyEntity = TopologyEntityBase & {
  readonly kind: "cluster";
  readonly clusterUid: string;
  readonly environmentLabel: string;
  readonly nodes: readonly NodeTopologyEntity[];
};

export type TopologyHierarchySnapshot = {
  readonly schemaVersion: "topology-hierarchy/v1";
  readonly workspaceId: string;
  readonly snapshotRevision: string;
  readonly observedAt: string;
  readonly dataOrigin: DataOrigin;
  readonly areaMetrics: readonly AreaMetricDescriptor[];
  readonly defaultAreaMetricId: string;
  readonly clusters: readonly ClusterTopologyEntity[];
  readonly completeness:
    | { readonly state: "complete" }
    | { readonly state: "partial"; readonly reasons: readonly string[] };
};

export class TopologyGatewayError extends Error {
  readonly code: "unconfigured" | "network" | "invalid_payload" | "forbidden";

  constructor(
    code: TopologyGatewayError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TopologyGatewayError";
    this.code = code;
  }
}

export interface TopologyHierarchyGateway {
  readonly dataOrigin: DataOrigin;
  getSnapshot(signal: AbortSignal): Promise<TopologyHierarchySnapshot>;
}
