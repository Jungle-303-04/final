import { vi } from "vitest";
import type {
  HomeEndpointClusterList,
  HomeEndpointClusterOverview,
  HomeEndpointDependencies,
  HomeEndpointInsights,
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
      provider: "eks",
      status: "connected",
      settings: {},
      connection_status: "online",
      last_agent_id: "agent-1",
      last_agent_seen_at: "2026-07-12T10:00:00Z",
      node_count: 2,
      pod_count: 18,
      incident_count: 1,
      server_count: 2,
      app_count: null,
      open_incidents: 1,
      last_seen_at: "2026-07-12T10:00:00Z",
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-12T10:00:01Z",
    },
    {
      workspace_id: "workspace-main",
      cluster_id: "kubernetes-ops",
      name: "Management",
      environment: "management",
      provider: "unknown",
      status: "pending_install",
      settings: {},
      connection_status: "never_connected",
      last_agent_id: null,
      last_agent_seen_at: null,
      node_count: 0,
      pod_count: 0,
      incident_count: 0,
      server_count: null,
      app_count: null,
      open_incidents: null,
      last_seen_at: null,
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
      kubernetes_version: "v1.30.7",
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
      kubernetes_version: "v1.30.7",
    },
  ],
};

export const HOME_INSIGHTS: HomeEndpointInsights = {
  cluster_id: "cluster-1",
  custom_resources: {
    coverage: {
      availability: "available",
      observed_at: "2026-07-12T10:00:00Z",
      reason_codes: [],
    },
    items: [{
      api_group: "argoproj.io",
      version: "v1alpha1",
      kind: "Application",
      count: 7,
    }],
    total_kinds: 1,
    total_resources: 7,
    has_more: false,
  },
  helm: {
    coverage: {
      availability: "partial",
      observed_at: "2026-07-12T10:00:00Z",
      reason_codes: ["source_resources_incomplete"],
    },
    release_count: 2,
    status_counts: { deployed: 1, failed: 1 },
  },
  certificate_expiry: {
    coverage: {
      availability: "available",
      observed_at: "2026-07-12T10:00:00Z",
      reason_codes: [],
    },
    items: [{
      secret: {
        api_group: "",
        version: "v1",
        kind: "Secret",
        namespace: "shop",
        name: "api-tls",
        uid: "secret-api-tls",
      },
      source_certificate: {
        api_group: "cert-manager.io",
        version: "v1",
        kind: "Certificate",
        namespace: "shop",
        name: "api-certificate",
        uid: "certificate-api",
      },
      not_after: "2026-07-20T10:00:00Z",
      status: "expiring",
      seconds_remaining: 345_600,
      observed_at: "2026-07-12T10:00:00Z",
    }],
    tls_secret_count: 1,
    observed_expiry_count: 1,
    expiring_count: 1,
    expired_count: 0,
    earliest_expiry: "2026-07-20T10:00:00Z",
    warning_before_seconds: 2_592_000,
    has_more: false,
  },
  refresh_after_seconds: 30,
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
    getHomeInsights: vi.fn(
      overrides.getHomeInsights ?? (() => Promise.resolve(HOME_INSIGHTS)),
    ),
    getClusterNodesSummary: vi.fn(
      overrides.getClusterNodesSummary ?? (() => Promise.resolve(NODE_COLLECTION)),
    ),
    getNodePodsSummary: vi.fn(
      overrides.getNodePodsSummary ?? (() => Promise.resolve(POD_COLLECTION)),
    ),
    subscribeHomeDashboardEvents: vi.fn(
      overrides.subscribeHomeDashboardEvents ?? (() => ({
        async *[Symbol.asyncIterator]() {
          yield* [];
        },
      })),
    ),
  };
}
