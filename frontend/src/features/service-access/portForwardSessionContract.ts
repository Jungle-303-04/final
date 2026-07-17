import type { BrowserRefreshPolicy } from "../../shared/data/browserRefreshPolicyRegistry";

export type PortForwardSessionStatus = "starting" | "running" | "stopped" | "error";

export interface LocalPortForwardRequest {
  scope: {
    workspaceId: string;
    clusterId: string;
    namespaces: string[];
    freshness: "live" | "stale" | "partial" | "disconnected";
  };
  resource: {
    apiGroup: "" | "core";
    version: "v1";
    kind: "Pod" | "Service";
    namespace: string;
    name: string;
    uid: string;
  };
  capabilityRevision: string;
  remotePort: number;
  localPort: number | null;
  listenAddress: "127.0.0.1";
  confirmation: true;
}

export interface PortForwardStartReceipt {
  sessionId: string;
  generation: number;
  localPort: number;
  startedAt: string;
}

export interface PortForwardSession {
  id: string;
  workspaceId: string;
  clusterId: string;
  freshness: "live" | "stale" | "partial" | "disconnected";
  namespace: string;
  resourceKind: "Pod" | "Service";
  resourceName: string;
  resourceUid: string;
  podName: string | null;
  podPort: number;
  localPort: number;
  listenAddress: "127.0.0.1";
  serviceName: string | null;
  servicePort: number | null;
  scheme: "http" | "https" | null;
  startedAt: string;
  status: PortForwardSessionStatus;
  error: string | null;
  exitCode: number | null;
}

export interface PortForwardSessionSnapshot {
  sessions: readonly PortForwardSession[];
  refreshPolicy: BrowserRefreshPolicy;
}

export interface PortForwardSessionPort {
  available: boolean;
  list(signal?: AbortSignal): Promise<PortForwardSessionSnapshot>;
  start(
    request: LocalPortForwardRequest,
    signal?: AbortSignal,
  ): Promise<PortForwardStartReceipt>;
  stop(sessionId: string, signal?: AbortSignal): Promise<void>;
  recreate(sessionId: string, signal?: AbortSignal): Promise<PortForwardStartReceipt>;
}

export const EMPTY_PORT_FORWARD_SESSION_PORT: PortForwardSessionPort = {
  available: false,
  list: () => Promise.reject(new Error("native port-forward registry is unavailable")),
  start: () => Promise.reject(new Error("native port-forward registry is unavailable")),
  stop: () => Promise.reject(new Error("native port-forward registry is unavailable")),
  recreate: () => Promise.reject(new Error("native port-forward registry is unavailable")),
};
