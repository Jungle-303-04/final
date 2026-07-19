import type {
  HomeClusterChoices,
  HomePodCollection,
} from "../../features/home/homeContract";

export const CLUSTERS: HomeClusterChoices = {
  completeness: "unknown",
  clusters: [
    {
      id: "cluster-1",
      workspaceId: "workspace-main",
      name: "cluster-1",
      environment: "production",
      provider: "eks",
      connectionStage: null,
      registrationState: "active",
      connectionState: "online",
      lastObservedAt: "2026-07-12T10:00:00.000Z",
      nodeCount: 2,
      podCount: 18,
      incidentCount: 1,
    },
    {
      id: "kubernetes-ops",
      workspaceId: "workspace-main",
      name: "kubernetes-ops",
      environment: "management",
      provider: "unknown",
      connectionStage: null,
      registrationState: "active",
      connectionState: "online",
      lastObservedAt: "2026-07-12T10:00:00.000Z",
      nodeCount: 1,
      podCount: 4,
      incidentCount: 0,
    },
  ],
};

export const PODS: HomePodCollection = {
  clusterId: "cluster-1",
  nodeName: "worker-b",
  completeness: "unknown",
  pods: [{
    id: "pod:cluster-1/worker-b/shop/checkout-api-0",
    identityStability: "ephemeral",
    name: "checkout-api-0",
    namespace: "shop",
    phase: "Running",
    health: "warning",
    readiness: { ready: 1, total: 2 },
    restartCount: 3,
    owner: { kind: "StatefulSet", name: "checkout-api" },
    cpuMillicores: 245.5,
    memoryMebibytes: 382,
    incidentCorrelationId: "correlation-1",
  }],
};
