import {
  ClustersPortFailure,
  type ClusterConnectProvider,
  type ClusterConnectStage,
  type ClusterDisconnectPort,
  type ClusterConnectionSnapshot,
  type ClustersFailureCode,
  type ClustersPort,
} from "./clustersContract";

interface ClusterConnectWire {
  cluster_id: string;
  install_command: string;
  expires_at: string;
}

interface ClusterConnectionWire {
  cluster_id: string;
  connection_status: string;
  connection_stage?: ClusterConnectStage;
  last_agent_id: string | null;
  last_seen_at: string | null;
  agents: Array<{ details: Record<string, unknown> }>;
  connect_timeout_seconds: number | null;
  connect_expires_at: string | null;
}

export interface ClustersEndpointDependencies {
  connectCluster(
    input: { name: string; provider: ClusterConnectProvider },
    signal?: AbortSignal,
  ): Promise<ClusterConnectWire>;
  getClusterConnectionStatus(
    clusterId: string,
    signal?: AbortSignal,
  ): Promise<ClusterConnectionWire>;
  unregisterCluster(clusterId: string, signal?: AbortSignal): Promise<void>;
}

export function createClustersAdapter(
  endpoints: ClustersEndpointDependencies,
): ClustersPort & ClusterDisconnectPort {
  return {
    async connect(input, signal) {
      return withFailure(async () => {
        const response = await endpoints.connectCluster(input, signal);
        const command = response.install_command.trim();
        if (!response.cluster_id.trim() || !command || command.includes("\n")) invalidResponse();
        canonicalTimestamp(response.expires_at);
        return {
          clusterId: response.cluster_id,
          installCommand: command,
          expiresAt: response.expires_at,
        };
      });
    },
    async loadConnection(clusterId, signal) {
      return withFailure(async () => {
        const response = await endpoints.getClusterConnectionStatus(clusterId, signal);
        canonicalNullableTimestamp(response.last_seen_at);
        const stage = response.connection_stage ?? "awaiting_install";
        const agentVersion = response.agents
          .map((agent) => agent.details.version)
          .find((version): version is string => typeof version === "string") ?? null;
        return {
          status: stage === "ready"
            ? "connected"
            : stage === "expired" || response.connection_status === "install_expired"
              ? "expired"
              : "waiting",
          stage,
          agentVersion,
          lastSeenAt: response.last_seen_at,
        } satisfies ClusterConnectionSnapshot;
      });
    },
    async disconnect(clusterId, signal) {
      await withFailure(() => endpoints.unregisterCluster(clusterId, signal));
    },
  };
}

async function withFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof ClustersPortFailure) throw error;
    throw new ClustersPortFailure(failureCode(error));
  }
}

function failureCode(error: unknown): ClustersFailureCode {
  const kind = typeof error === "object" && error !== null && "kind" in error &&
      typeof error.kind === "string"
    ? error.kind
    : "";
  const codes: Record<string, ClustersFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    network: "offline",
    "invalid-payload": "invalid-response",
    conflict: "conflict",
  };
  return codes[kind] ?? "error";
}

function canonicalTimestamp(value: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) invalidResponse();
}

function canonicalNullableTimestamp(value: string | null): void {
  if (value !== null) canonicalTimestamp(value);
}

function invalidResponse(): never {
  throw new ClustersPortFailure("invalid-response");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
