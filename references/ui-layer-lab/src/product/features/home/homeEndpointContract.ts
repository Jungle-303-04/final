export interface HomeEndpointClusterSummary {
  workspace_id: string;
  cluster_id: string;
  name: string;
  environment: string;
  status: string;
  settings: Record<string, unknown>;
  connection_status: string;
  last_agent_id: string | null;
  last_agent_seen_at: string | null;
  node_count: number;
  pod_count: number;
  incident_count: number;
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
  getClusterNodesSummary(
    clusterId: string,
    signal?: AbortSignal,
  ): Promise<HomeEndpointNodeCollection>;
  getNodePodsSummary(
    clusterId: string,
    nodeName: string,
    signal?: AbortSignal,
  ): Promise<HomeEndpointPodCollection>;
}
