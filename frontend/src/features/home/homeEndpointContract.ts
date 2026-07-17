import type { HomeConnectionStage } from "./homeContract";

export interface HomeEndpointClusterSummary {
  workspace_id: string;
  cluster_id: string;
  name: string;
  environment: string;
  provider?: "eks" | "gke" | "aks" | "onprem" | "kind" | "unknown";
  status: string;
  settings: Record<string, unknown>;
  connection_status: string;
  connection_stage?: HomeConnectionStage;
  last_agent_id: string | null;
  last_agent_seen_at: string | null;
  node_count: number | null;
  pod_count: number | null;
  namespace_count?: number | null;
  kubernetes_version?: string | null;
  crd_discovery_status?: "exact" | "partial" | "unavailable" | null;
  incident_count: number | null;
  server_count?: number | null;
  app_count?: number | null;
  open_incidents?: number | null;
  last_seen_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface HomeEndpointClusterList {
  clusters: HomeEndpointClusterSummary[];
}

export interface HomeEndpointWorkload {
  name: string;
  kind: string;
  namespace: string | null;
  health: string;
  ready: string;
  restarts: number;
}

export interface HomeEndpointWarning {
  namespace: string | null;
  name: string;
  reason: string | null;
  message: string | null;
  involved_kind: string | null;
  involved_name: string | null;
  count: number;
  last_seen_at: string | null;
}

export interface HomeEndpointIncident {
  incident_id: string;
  correlation_id: string;
  symptom: string | null;
  root_cause: string | null;
  namespace: string | null;
  resource_kind: string | null;
  resource_name: string | null;
  status: string;
  created_at: string | null;
}

export interface HomeEndpointUsage {
  sampled_at: string | null;
  pods_running: number;
  pods_total?: number;
  nodes_ready: number;
  nodes_total: number;
  restart_total: number;
  cpu_pct: number | null;
  mem_pct: number | null;
}

export interface HomeEndpointClusterOverview {
  cluster_id: string;
  name: string;
  health: string;
  workloads: Record<string, HomeEndpointWorkload[]>;
  warning_events: HomeEndpointWarning[];
  open_incidents: HomeEndpointIncident[];
  usage: HomeEndpointUsage | null;
}

export interface HomeEndpointNode {
  name: string;
  ready: boolean;
  health: string;
  kubernetes_version: string | null;
  pods_running: number;
  pods_capacity: number;
  cpu_pct: number | null;
  mem_pct: number | null;
  restarts_recent: number;
  conditions: string[];
}

export interface HomeEndpointNodeCollection {
  cluster_id: string;
  nodes: HomeEndpointNode[];
}

export interface HomeEndpointInsightCoverage {
  availability: "available" | "partial" | "unavailable";
  observed_at: string | null;
  reason_codes: string[];
}

export interface HomeEndpointInsights {
  cluster_id: string;
  custom_resources: {
    coverage: HomeEndpointInsightCoverage;
    items: Array<{
      api_group: string;
      version: string;
      kind: string;
      count: number;
    }>;
    total_kinds: number | null;
    total_resources: number | null;
    has_more: boolean;
  };
  helm: {
    coverage: HomeEndpointInsightCoverage;
    release_count: number | null;
    status_counts: Record<string, number>;
  };
  certificate_expiry: {
    coverage: HomeEndpointInsightCoverage;
    items: Array<{
      secret: HomeEndpointResourceRef;
      source_certificate: HomeEndpointResourceRef;
      not_after: string;
      status: "valid" | "expiring" | "expired";
      seconds_remaining: number;
      observed_at: string | null;
    }>;
    tls_secret_count: number | null;
    observed_expiry_count: number | null;
    expiring_count: number | null;
    expired_count: number | null;
    earliest_expiry: string | null;
    warning_before_seconds: number;
    has_more: boolean;
  };
  refresh_after_seconds: number;
}

export interface HomeEndpointResourceRef {
  api_group: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface HomeEndpointPod {
  name: string;
  namespace: string;
  phase: string;
  health: string;
  ready: string;
  restarts: number;
  owner_kind: string | null;
  owner_name: string | null;
  cpu_mcores: number | null;
  mem_mib: number | null;
  incident_correlation_id: string | null;
}

export interface HomeEndpointPodCollection {
  cluster_id: string;
  node_name: string;
  pods: HomeEndpointPod[];
}

export interface HomeEndpointDependencies {
  listClusters(
    options?: { limit?: number },
    signal?: AbortSignal,
  ): Promise<HomeEndpointClusterList>;
  getClusterSummary(
    clusterId: string,
    signal?: AbortSignal,
  ): Promise<HomeEndpointClusterOverview>;
  getHomeInsights(
    clusterId: string,
    signal?: AbortSignal,
  ): Promise<HomeEndpointInsights>;
  getClusterNodesSummary(
    clusterId: string,
    signal?: AbortSignal,
  ): Promise<HomeEndpointNodeCollection>;
  getNodePodsSummary(
    clusterId: string,
    nodeName: string,
    signal?: AbortSignal,
  ): Promise<HomeEndpointPodCollection>;
  subscribeHomeDashboardEvents(
    clusterId: string,
    options?: HomeEndpointDashboardEventSubscription,
  ): AsyncIterable<HomeEndpointDashboardEvent>;
}

export interface HomeEndpointDashboardEventSubscription {
  after?: string;
  signal?: AbortSignal;
}

export interface HomeEndpointDashboardEvent {
  kind: "connected" | "deferred_ready" | "heartbeat";
  cursor: string;
  scope: {
    workspace_id: string;
    cluster_id: string;
    namespaces: readonly string[];
    freshness: "live" | "stale" | "partial" | "disconnected";
  };
  reconnect_after_ms: number;
  snapshot_id?: string;
  occurred_at?: string;
}
