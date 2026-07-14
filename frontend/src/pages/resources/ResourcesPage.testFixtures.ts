import type { HomeClusterChoices } from "../../features/home/homeContract";
import type {
  ResourceCatalog,
  ResourceDetail,
  ResourceList,
  ResourceSummary,
} from "../../features/resources/resourcesContract";

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

const HEALTH_COUNTS = {
  healthy: 2,
  warning: 1,
  critical: 0,
  stale: 0,
  unknown: 0,
} as const;

export const CATALOG: ResourceCatalog = {
  clusterId: "cluster-1",
  completeness: "unknown",
  observedAt: "2026-07-12T10:00:00.000Z",
  items: [
    { resourceType: "pod", count: 3, healthCounts: HEALTH_COUNTS },
    {
      resourceType: "node",
      count: 2,
      healthCounts: { ...HEALTH_COUNTS, healthy: 2, warning: 0 },
    },
  ],
};

export const DISCOVERED_CATALOG: ResourceCatalog = {
  ...CATALOG,
  items: [
    {
      resourceType: "widget",
      count: 1,
      healthCounts: { ...HEALTH_COUNTS, healthy: 0, warning: 0, unknown: 1 },
    },
  ],
};

export const POD_LIST: ResourceList = {
  clusterId: "cluster-1",
  resourceType: "pod",
  namespace: null,
  includeDeleted: false,
  completeness: "unknown",
  limit: 3,
  limitReached: true,
  returned: 3,
  items: [
    resourceRow({
      id: "pod:cluster-1/shop/checkout-api-0",
      inventoryKey: "pod:shop/checkout-api-0",
      uid: "uid-checkout",
      kind: "Pod",
      namespace: "shop",
      name: "checkout-api-0",
      status: "Running",
      health: "warning",
    }),
    resourceRow({
      id: "pod:cluster-1/shop/orders-api-0",
      inventoryKey: "pod:shop/orders-api-0",
      uid: "uid-orders",
      kind: "Pod",
      namespace: "shop",
      name: "orders-api-0",
      status: "Running",
      health: "healthy",
    }),
    resourceRow({
      id: "pod:cluster-1/ops/telemetry-0",
      inventoryKey: "pod:ops/telemetry-0",
      uid: "uid-telemetry",
      kind: "Pod",
      namespace: "ops",
      name: "telemetry-0",
      status: "Pending",
      health: "unknown",
    }),
  ],
};

export const NODE_LIST: ResourceList = {
  ...POD_LIST,
  clusterId: "kubernetes-ops",
  resourceType: "node",
  limitReached: false,
  returned: 1,
  items: [
    resourceRow({
      id: "node:kubernetes-ops/worker-new",
      inventoryKey: "node:worker-new",
      uid: "uid-node-new",
      resourceType: "node",
      apiVersion: "v1",
      kind: "Node",
      namespace: null,
      name: "worker-new",
      status: "Ready",
      health: "healthy",
    }),
  ],
};

export const POD_DETAIL: ResourceDetail = {
  clusterId: "cluster-1",
  identity: {
    resourceType: "pod",
    kind: "Pod",
    namespace: "shop",
    name: "checkout-api-0",
  },
  resource: POD_LIST.items[0],
  relatedCompleteness: "unknown",
  related: [],
  eventsCompleteness: "unknown",
  events: [
    resourceRow({
      id: "event:cluster-1/shop/checkout-warning",
      inventoryKey: "event:shop/checkout-warning",
      uid: null,
      identityStability: "fallback",
      resourceType: "event",
      kind: "Event",
      namespace: "shop",
      name: "checkout-warning",
      status: "Warning",
      health: "warning",
      healthStatus: "warning",
      observedAt: "2026-07-12T09:59:00.000Z",
      facts: {
        type: "event",
        eventType: "Warning",
        reason: "BackOff",
        message: "Container is restarting",
        occurrenceCount: 2,
        firstSeenAt: "2026-07-12T09:58:00.000Z",
        lastSeenAt: "2026-07-12T09:59:00.000Z",
        reportingComponent: "kubelet",
        involvedResource: {
          kind: "Pod",
          name: "checkout-api-0",
          uid: "uid-checkout",
        },
      },
    }),
  ],
};

function resourceRow(overrides: Partial<ResourceSummary>): ResourceSummary {
  return {
    id: "resource:unknown",
    identityStability: "uid",
    inventoryKey: "resource:unknown",
    uid: "uid-unknown",
    clusterId: "cluster-1",
    resourceType: "pod",
    apiVersion: "v1",
    kind: "Pod",
    namespace: "default",
    name: "unknown",
    status: "Unknown",
    health: "unknown",
    healthStatus: "unknown",
    facts: { type: "generic" },
    observedAt: "2026-07-12T10:00:00.000Z",
    firstSeenAt: "2026-07-12T09:00:00.000Z",
    lastSeenAt: "2026-07-12T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}
