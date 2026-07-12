import { vi } from "vitest";
import type {
  HomeEndpointClusterList,
  HomeEndpointClusterOverview,
  HomeEndpointDependencies,
  HomeEndpointNodeCollection,
  HomeEndpointPodCollection,
} from "./createHomeAdapter";

export const CLUSTER_LIST: HomeEndpointClusterList = {
  clusters: [
    {
      workspace_id: "workspace-main",
      cluster_id: "cluster-1",
      name: "Production",
      environment: "production",
      status: "connected",
      settings: {},
      connection_status: "online",
      last_agent_id: "agent-1",
      last_agent_seen_at: "2026-07-12T10:00:00Z",
      node_count: 2,
      pod_count: 18,
      incident_count: 1,
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-12T10:00:01Z",
    },
    {
      workspace_id: "workspace-main",
      cluster_id: "kubernetes-ops",
      name: "Management",
      environment: "management",
      status: "pending_install",
      settings: {},
      connection_status: "never_connected",
      last_agent_id: null,
      last_agent_seen_at: null,
      node_count: 0,
      pod_count: 0,
      incident_count: 0,
      created_at: null,
      updated_at: null,
    },
  ],
};

export const CLUSTER_OVERVIEW: HomeEndpointClusterOverview = {
  cluster_id: "cluster-1",
  name: "Production",
  health: "critical",
  workloads: {
    healthy: [{
      name: "catalog-api",
      kind: "Deployment",
      namespace: "shop",
      health: "healthy",
      ready: "3/3",
      restarts: 0,
    }],
    degraded: [{
      name: "checkout-api",
      kind: "StatefulSet",
      namespace: "shop",
      health: "degraded",
      ready: "1/2",
      restarts: 3,
    }],
  },
  warning_events: [{
    namespace: "shop",
    name: "checkout-warning",
    reason: "BackOff",
    message: "Container is restarting",
    involved_kind: "Pod",
    involved_name: "checkout-api-0",
    count: 2,
    last_seen_at: "2026-07-12T09:59:00Z",
  }],
  open_incidents: [{
    incident_id: "incident-1",
    correlation_id: "correlation-1",
    symptom: "Restart loop",
    root_cause: null,
    namespace: "shop",
    resource_kind: "Pod",
    resource_name: "checkout-api-0",
    status: "open",
    created_at: "2026-07-12T09:58:00Z",
  }],
  usage: {
    sampled_at: "2026-07-12T10:00:00Z",
    pods_running: 17,
    pods_total: 18,
    nodes_ready: 2,
    nodes_total: 2,
    restart_total: 3,
    cpu_pct: 42.5,
    mem_pct: 61.25,
  },
};

export const NODE_COLLECTION: HomeEndpointNodeCollection = {
  cluster_id: "cluster-1",
  nodes: [
    {
      name: "worker-a",
      ready: true,
      health: "healthy",
      pods_running: 9,
      pods_capacity: 110,
      cpu_pct: 37.5,
      mem_pct: 54,
      restarts_recent: 0,
      conditions: [],
    },
    {
      name: "worker-b",
      ready: false,
      health: "degraded",
      pods_running: 8,
      pods_capacity: 110,
      cpu_pct: null,
      mem_pct: null,
      restarts_recent: 3,
      conditions: ["MemoryPressure"],
    },
  ],
};

export const POD_COLLECTION: HomeEndpointPodCollection = {
  cluster_id: "cluster-1",
  node_name: "worker-b",
  pods: [{
    name: "checkout-api-0",
    namespace: "shop",
    phase: "Running",
    health: "degraded",
    ready: "1/2",
    restarts: 3,
    owner_kind: "StatefulSet",
    owner_name: "checkout-api",
    cpu_mcores: 245.5,
    mem_mib: 382,
    incident_correlation_id: "correlation-1",
  }],
};

export function endpoints(overrides: Partial<HomeEndpointDependencies> = {}) {
  return {
    listClusters: vi.fn(
      overrides.listClusters ?? (() => Promise.resolve(CLUSTER_LIST)),
    ),
    getClusterSummary: vi.fn(
      overrides.getClusterSummary ?? (() => Promise.resolve(CLUSTER_OVERVIEW)),
    ),
    getClusterNodesSummary: vi.fn(
      overrides.getClusterNodesSummary ?? (() => Promise.resolve(NODE_COLLECTION)),
    ),
    getNodePodsSummary: vi.fn(
      overrides.getNodePodsSummary ?? (() => Promise.resolve(POD_COLLECTION)),
    ),
  };
}
