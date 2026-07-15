export type ClusterConnectProvider = "aws" | "gcp" | "azure" | "onprem";
export type ClusterConnectState = "waiting" | "connected" | "expired";
export type ClusterConnectStage =
  | "token_issued"
  | "awaiting_install"
  | "agent_connected"
  | "snapshot_received"
  | "ready"
  | "expired"
  | "error";

export interface ClusterConnectReceipt {
  clusterId: string;
  installCommand: string;
  expiresAt: string;
}

export interface ClusterConnectionSnapshot {
  status: ClusterConnectState;
  stage: ClusterConnectStage;
  agentVersion: string | null;
  lastSeenAt: string | null;
}

export type ClustersFailureCode =
  | "unauthorized"
  | "forbidden"
  | "offline"
  | "invalid-response"
  | "conflict"
  | "error";

export class ClustersPortFailure extends Error {
  readonly code: ClustersFailureCode;

  constructor(code: ClustersFailureCode) {
    super(`Clusters port failed: ${code}`);
    this.name = "ClustersPortFailure";
    this.code = code;
  }
}

export interface ClustersPort {
  connect(
    input: { name: string; provider: ClusterConnectProvider },
    signal?: AbortSignal,
  ): Promise<ClusterConnectReceipt>;
  loadConnection(
    clusterId: string,
    signal?: AbortSignal,
  ): Promise<ClusterConnectionSnapshot>;
}

export interface ClusterDisconnectPort {
  disconnect(clusterId: string, signal?: AbortSignal): Promise<void>;
}
