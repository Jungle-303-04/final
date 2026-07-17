import { vi } from "vitest";
import type {
  KubernetesApiResourcesEndpoint,
  ResourcesEndpointDependencies,
  ResourcesEndpointInventorySummary,
  ResourcesEndpointResource,
  ResourcesEndpointResourceDetail,
  ResourcesEndpointResourceList,
} from "./resourcesEndpointContract";

export const INVENTORY_SUMMARY: ResourcesEndpointInventorySummary = {
  cluster_id: "cluster-1",
  latest_snapshot: {
    snapshot_id: "snapshot-1",
    collected_at: "2026-07-12T10:00:00Z",
    summary: { must_not_reach_product_state: true },
  },
  counts: [
    { resource_type: "pod", health: "healthy", count: 2 },
    { resource_type: "pod", health: "degraded", count: 1 },
    { resource_type: "service", health: "healthy", count: 1 },
    { resource_type: "service", health: "future-state", count: 2 },
  ],
};

export const API_RESOURCES: KubernetesApiResourcesEndpoint = {
  cluster_id: "cluster-1",
  snapshot_id: "snapshot-1",
  discovery: {
    observed_at: "2026-07-12T10:00:00Z",
    completeness: "exact",
    reason_codes: [],
    resources: [{
      group: "",
      version: "v1",
      api_version: "v1",
      name: "pods",
      singular_name: "pod",
      kind: "Pod",
      namespaced: true,
      is_crd: false,
      verbs: ["get", "list", "watch"],
    }],
  },
  unavailable_reason: null,
};

export function endpointResource(
  overrides: Partial<ResourcesEndpointResource> = {},
): ResourcesEndpointResource {
  return {
    inventory_key: "inventory-pod-1",
    snapshot_id: "snapshot-1",
    workspace_id: "workspace-1",
    cluster_id: "cluster-1",
    resource_type: "pod",
    api_version: "v1",
    kind: "Pod",
    namespace: "shop",
    name: "checkout-api-0",
    uid: "uid-pod-1",
    resource_version: "10",
    status: "Running",
    health: "healthy",
    labels: {
      app: "checkout",
      enabled: true,
      revision: 3,
      nested: { must_not_reach_product_state: true },
      absent: null,
    },
    annotations: {
      "example.com/owner": "payments",
      nested: ["must-not-leak"],
    },
    summary: {
      phase: "Running",
      node_name: "worker-a",
      owner_kind: "StatefulSet",
      owner_name: "checkout-api",
      containers: [
        { name: "app", ready: true },
        { name: "sidecar", ready: false },
      ],
      restart_total: 3,
      cpu_mcores: 245.5,
      mem_mib: 382,
      pod_ip: "10.0.0.10",
      host_ip: "10.0.0.2",
      waiting_reasons: ["CrashLoopBackOff"],
      terminated_reasons: ["OOMKilled"],
      unknown_nested_field: { must_not_reach_product_state: true },
    },
    observed_at: "2026-07-12T10:00:00Z",
    first_seen_at: "2026-07-12T09:00:00Z",
    last_seen_at: "2026-07-12T10:00:00Z",
    deleted_at: null,
    created_at: "2026-07-12T09:00:00Z",
    updated_at: "2026-07-12T10:00:00Z",
    ...overrides,
  };
}

export const POD_LIST: ResourcesEndpointResourceList = {
  cluster_id: "cluster-1",
  resource_type: "pod",
  resources: [
    endpointResource(),
    endpointResource({
      inventory_key: "inventory-pod-2",
      name: "checkout-api-1",
      uid: null,
      health: "future-state",
      labels: {},
      annotations: {},
      summary: {},
    }),
  ],
};

export const RESOURCE_DETAIL: ResourcesEndpointResourceDetail = {
  cluster_id: "cluster-1",
  identity: {
    resource_type: "service",
    kind: "Service",
    namespace: "shop",
    name: "checkout",
    ignored_transport_field: { not_for_product_state: true },
  },
  resource: endpointResource({
    inventory_key: "inventory-service-1",
    resource_type: "service",
    kind: "Service",
    name: "checkout",
    uid: "uid-service-1",
    status: "Active",
    summary: {
      type: "ClusterIP",
      cluster_ip: "10.96.0.1",
      external_url: null,
      external_hosts: ["checkout.example.test"],
      selector: { app: "checkout", revision: 3, nested: { omit: true } },
      ports: [
        {
          name: "http",
          protocol: "TCP",
          port: 80,
          targetPort: 8080,
          nodePort: null,
          ignored: { omit: true },
        },
      ],
    },
  }),
  related: {
    pods: [endpointResource()],
  },
  events: [
    endpointResource({
      inventory_key: "inventory-event-1",
      resource_type: "event",
      kind: "Event",
      name: "checkout-updated",
      uid: "uid-event-1",
      status: "Normal",
      summary: {
        type: "Normal",
        reason: "Updated",
        message: "Service updated",
        count: 2,
        first_timestamp: "2026-07-12T09:30:00Z",
        last_timestamp: "2026-07-12T09:59:00Z",
        reporting_component: "service-controller",
        involved_kind: "Service",
        involved_name: "checkout",
        involved_uid: "uid-service-1",
      },
    }),
  ],
};

export function endpoints(overrides: Partial<ResourcesEndpointDependencies> = {}) {
  return {
    getKubernetesApiResources: vi.fn(
      overrides.getKubernetesApiResources ?? (() => Promise.resolve(API_RESOURCES)),
    ),
    getInventorySummary: vi.fn(
      overrides.getInventorySummary ?? (() => Promise.resolve(INVENTORY_SUMMARY)),
    ),
    listInventoryResourcesByType: vi.fn(
      overrides.listInventoryResourcesByType ?? (() => Promise.resolve(POD_LIST)),
    ),
    getInventoryResourceDetail: vi.fn(
      overrides.getInventoryResourceDetail ?? (() => Promise.resolve(RESOURCE_DETAIL)),
    ),
  } satisfies ResourcesEndpointDependencies;
}
