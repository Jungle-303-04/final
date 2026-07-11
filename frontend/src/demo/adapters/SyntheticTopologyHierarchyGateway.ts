import type {
  ClusterTopologyEntity,
  HealthLevel,
  MetricValue,
  NodeTopologyEntity,
  PodTopologyEntity,
  TopologyHierarchyGateway,
  TopologyHierarchySnapshot,
} from "../../features/topology/contracts";

const origin = {
  kind: "synthetic",
  adapterId: "synthetic-topology-hierarchy/v1",
  datasetId: "fleet-balanced/v1",
  seed: "kubeheal-demo-11",
} as const;

function metric(value: string, unitId: string): MetricValue {
  return value === "0"
    ? { state: "zero", valueDecimal: "0", unitId }
    : { state: "value", valueDecimal: value, unitId };
}

function metrics(cpu: string, memory: string, storage: string, cost: string) {
  return {
    "cpu.usage.cores": metric(cpu, "core"),
    "memory.usage.bytes": metric(memory, "By"),
    "storage.usage.bytes": metric(storage, "By"),
    "cost.period.amount": metric(cost, "USD"),
  } as const;
}

function pod(
  key: string,
  name: string,
  namespace: string,
  health: HealthLevel,
  values: readonly [string, string, string, string],
): PodTopologyEntity {
  return {
    kind: "pod",
    entityKey: key,
    resourceUid: `${key}:uid`,
    displayName: name,
    namespace,
    phase: health === "unhealthy" ? "CrashLoopBackOff" : "Running",
    health,
    healthReason: health === "healthy" ? "Ready" : "Synthetic health scenario",
    metrics: metrics(...values),
  };
}

function node(
  key: string,
  name: string,
  health: HealthLevel,
  pods: readonly PodTopologyEntity[],
): NodeTopologyEntity {
  const sum = (metricId: string) =>
    pods.reduce((total, item) => {
      const value = item.metrics[metricId];
      return total + (value?.valueDecimal === null || value === undefined ? 0 : Number(value.valueDecimal));
    }, 0);

  return {
    kind: "node",
    entityKey: key,
    resourceUid: `${key}:uid`,
    displayName: name,
    health,
    healthReason: health === "healthy" ? "Ready" : "Synthetic node condition",
    metrics: metrics(
      String(sum("cpu.usage.cores")),
      String(sum("memory.usage.bytes")),
      String(sum("storage.usage.bytes")),
      String(sum("cost.period.amount")),
    ),
    pods,
  };
}

const clusters: readonly ClusterTopologyEntity[] = [
  {
    kind: "cluster",
    entityKey: "cluster:seoul-prod",
    clusterUid: "cluster:seoul-prod:uid",
    displayName: "seoul-production",
    environmentLabel: "Production",
    health: "degraded",
    healthReason: "1 Pod requires attention",
    metrics: metrics("7.9", "18600000000", "320000000000", "684"),
    nodes: [
      node("node:seoul-a", "worker-seoul-a", "healthy", [
        pod("pod:checkout-a", "checkout-api-7c8f9", "commerce", "healthy", ["1.8", "4200000000", "38000000000", "141"]),
        pod("pod:catalog-a", "catalog-api-5fd64", "commerce", "healthy", ["1.1", "2700000000", "24000000000", "98"]),
        pod("pod:otel-a", "otel-collector-k2v8m", "observability", "neutral", ["0.4", "1100000000", "7000000000", "42"]),
      ]),
      node("node:seoul-b", "worker-seoul-b", "degraded", [
        pod("pod:payment-a", "payment-api-55dfc", "commerce", "unhealthy", ["2.4", "5600000000", "52000000000", "189"]),
        pod("pod:gateway-a", "edge-gateway-6cb48", "edge", "healthy", ["1.5", "3300000000", "31000000000", "117"]),
        pod("pod:loki-a", "loki-write-0", "observability", "healthy", ["0.7", "1700000000", "29000000000", "97"]),
      ]),
    ],
  },
  {
    kind: "cluster",
    entityKey: "cluster:tokyo-stage",
    clusterUid: "cluster:tokyo-stage:uid",
    displayName: "tokyo-staging",
    environmentLabel: "Staging",
    health: "healthy",
    healthReason: "All observed workloads are ready",
    metrics: metrics("4.6", "11200000000", "178000000000", "392"),
    nodes: [
      node("node:tokyo-a", "worker-tokyo-a", "healthy", [
        pod("pod:storefront-b", "storefront-web-7b94f", "sandbox", "healthy", ["1.2", "2900000000", "26000000000", "91"]),
        pod("pod:orders-b", "orders-api-96876", "sandbox", "healthy", ["1.4", "3400000000", "38000000000", "118"]),
        pod("pod:prom-b", "prometheus-0", "target", "healthy", ["0.8", "2200000000", "41000000000", "84"]),
      ]),
      node("node:tokyo-b", "worker-tokyo-b", "healthy", [
        pod("pod:tempo-b", "tempo-0", "target", "healthy", ["0.6", "1400000000", "31000000000", "54"]),
        pod("pod:loki-b", "loki-0", "target", "healthy", ["0.4", "900000000", "28000000000", "45"]),
        pod("pod:agent-b", "cluster-agent-6499d", "target", "neutral", ["0.2", "400000000", "14000000000", "0"]),
      ]),
    ],
  },
];

const snapshot: TopologyHierarchySnapshot = {
  schemaVersion: "topology-hierarchy/v1",
  workspaceId: "workspace:synthetic-demo",
  snapshotRevision: "synthetic-frame-11",
  observedAt: "2026-07-11T00:00:00Z",
  dataOrigin: origin,
  areaMetrics: [
    { metricId: "cpu.usage.cores", label: "CPU 사용 코어", unitId: "core", additive: true, order: 10 },
    { metricId: "memory.usage.bytes", label: "메모리 사용 바이트", unitId: "By", additive: true, order: 20 },
    { metricId: "storage.usage.bytes", label: "스토리지 사용 바이트", unitId: "By", additive: true, order: 30 },
    { metricId: "cost.period.amount", label: "기간 비용", unitId: "USD", additive: true, order: 40 },
  ],
  defaultAreaMetricId: "cpu.usage.cores",
  clusters,
  completeness: { state: "complete" },
};

export class SyntheticTopologyHierarchyGateway implements TopologyHierarchyGateway {
  readonly dataOrigin = origin;

  async getSnapshot(signal: AbortSignal): Promise<TopologyHierarchySnapshot> {
    signal.throwIfAborted();
    return structuredClone(snapshot);
  }
}
