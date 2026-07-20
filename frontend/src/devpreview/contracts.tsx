import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { clusterListSchema, type ClusterSummary } from "../api/cluster-schemas";
import { listClusters } from "../api/clusters";

export type DevpreviewDataSource = "live" | "fixture";
export type DevpreviewDataStatus = "loading" | "ready" | "error";

export interface DevpreviewCluster {
  id: string;
  workspaceId: string;
  name: string;
  displayName: string;
  environment: string;
  provider: NonNullable<ClusterSummary["provider"]>;
  connectionStatus: string;
  connectionStage: ClusterSummary["connection_stage"] | null;
  observationMode: NonNullable<ClusterSummary["observation_mode"]>;
  lastObservedAt: string | null;
  kubernetesVersion: string | null;
  nodeCount: number | null;
  podCount: number | null;
  namespaceCount: number | null;
  incidentCount: number | null;
  role: "management" | "target";
  readOnly: boolean;
}

export interface DevpreviewContractState {
  source: DevpreviewDataSource;
  status: DevpreviewDataStatus;
  workspaceId: string | null;
  clusters: DevpreviewCluster[];
  error: string | null;
  refresh(): void;
}

/**
 * Offline-only preview fixture. It uses the gateway wire contract verbatim and
 * is parsed at module load, so a backend contract change fails loudly instead
 * of silently drifting from the product adapter.
 */
export const DEV_PREVIEW_CLUSTER_FIXTURE = clusterListSchema.parse({
  clusters: [
    contractCluster({
      clusterId: "management-server",
      displayName: "매니지먼트 서버",
      environment: "management",
      role: "management",
    }),
    contractCluster({
      clusterId: "game-server",
      displayName: "게임 서버",
      environment: "production",
      role: "target",
    }),
    contractCluster({
      clusterId: "demo-server",
      displayName: "데모 서버",
      environment: "development",
      role: "target",
    }),
  ],
});

const EMPTY_STATE: DevpreviewContractState = {
  source: "live",
  status: "loading",
  workspaceId: null,
  clusters: [],
  error: null,
  refresh: () => undefined,
};

const DevpreviewContractContext = createContext<DevpreviewContractState>(EMPTY_STATE);

export function DevpreviewContractProvider({ children }: { children: ReactNode }) {
  const source = readDataSource();
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<DevpreviewDataStatus>("loading");
  const [clusters, setClusters] = useState<DevpreviewCluster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    setStatus("loading");
    setError(null);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const request = source === "fixture"
      ? Promise.resolve(DEV_PREVIEW_CLUSTER_FIXTURE)
      : listClusters({}, controller.signal);

    void request.then((response) => {
      if (controller.signal.aborted) return;
      setClusters(response.clusters.map(projectCluster));
      setStatus("ready");
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setClusters([]);
      setError(contractErrorMessage(cause));
      setStatus("error");
    });

    return () => controller.abort();
  }, [revision, source]);

  const workspaceId = clusters[0]?.workspaceId ?? null;
  const value = useMemo<DevpreviewContractState>(() => ({
    source,
    status,
    workspaceId,
    clusters,
    error,
    refresh,
  }), [clusters, error, refresh, source, status, workspaceId]);

  return (
    <DevpreviewContractContext.Provider value={value}>
      {children}
    </DevpreviewContractContext.Provider>
  );
}

export function useDevpreviewContracts(): DevpreviewContractState {
  return useContext(DevpreviewContractContext);
}

export function projectCluster(cluster: ClusterSummary): DevpreviewCluster {
  const configuredName = cluster.settings.name;
  const configuredRole = cluster.settings.cluster_role;
  const role = configuredRole === "management" || cluster.environment === "management"
    ? "management"
    : "target";

  return {
    id: cluster.cluster_id,
    workspaceId: cluster.workspace_id,
    name: cluster.name,
    displayName: typeof configuredName === "string" && configuredName.trim()
      ? configuredName
      : cluster.name,
    environment: cluster.environment,
    provider: cluster.provider ?? "unknown",
    connectionStatus: cluster.connection_status,
    connectionStage: cluster.connection_stage ?? null,
    observationMode: cluster.observation_mode ?? "agent",
    lastObservedAt: cluster.last_agent_seen_at ?? cluster.last_seen_at ?? null,
    kubernetesVersion: cluster.kubernetes_version ?? null,
    nodeCount: cluster.node_count,
    podCount: cluster.pod_count,
    namespaceCount: cluster.namespace_count ?? null,
    incidentCount: cluster.incident_count,
    role,
    readOnly: role === "management",
  };
}

function readDataSource(): DevpreviewDataSource {
  if (typeof window === "undefined") return "fixture";
  const query = new URLSearchParams(window.location.search).get("data");
  if (query === "fixture") return "fixture";
  return import.meta.env.VITE_DEVPREVIEW_DATA_MODE === "fixture" ? "fixture" : "live";
}

function contractCluster(input: {
  clusterId: string;
  displayName: string;
  environment: string;
  role: "management" | "target";
}) {
  return {
    workspace_id: "default",
    cluster_id: input.clusterId,
    name: input.clusterId,
    environment: input.environment,
    provider: "eks" as const,
    observation_mode: "agent" as const,
    status: "registered",
    settings: {
      name: input.displayName,
      cluster_role: input.role,
    },
    connection_status: "online",
    connection_stage: "ready" as const,
    last_agent_id: `${input.clusterId}-agent`,
    last_agent_seen_at: "2026-07-20T00:00:00.000Z",
    node_count: input.role === "management" ? 2 : 3,
    pod_count: input.role === "management" ? 24 : 36,
    namespace_count: input.role === "management" ? 8 : 12,
    kubernetes_version: "v1.34.9-eks",
    crd_discovery_status: "exact" as const,
    incident_count: 0,
    server_count: null,
    app_count: null,
    open_incidents: 0,
    last_seen_at: "2026-07-20T00:00:00.000Z",
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:00.000Z",
  };
}

function contractErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return "계약 데이터를 불러오지 못했습니다.";
}
