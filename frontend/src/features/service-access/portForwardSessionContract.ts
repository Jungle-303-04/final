import type { BrowserRefreshPolicy } from "../../shared/data/browserRefreshPolicyRegistry";

export type PortForwardSessionStatus = "running" | "stopped" | "error";

export interface PortForwardSession {
  id: string;
  clusterId: string;
  namespace: string;
  podName: string;
  podPort: number;
  localPort: number;
  listenAddress: "127.0.0.1" | "0.0.0.0";
  serviceName: string | null;
  servicePort: number | null;
  scheme: "http" | "https" | null;
  startedAt: string;
  status: PortForwardSessionStatus;
  error: string | null;
}

export interface PortForwardSessionSnapshot {
  sessions: readonly PortForwardSession[];
  refreshPolicy: BrowserRefreshPolicy;
}

export interface PortForwardSessionPort {
  available: boolean;
  list(signal?: AbortSignal): Promise<PortForwardSessionSnapshot>;
  stop(sessionId: string, signal?: AbortSignal): Promise<void>;
}

export const EMPTY_PORT_FORWARD_SESSION_PORT: PortForwardSessionPort = {
  available: false,
  list: () => Promise.reject(new Error("native port-forward registry is unavailable")),
  stop: () => Promise.reject(new Error("native port-forward registry is unavailable")),
};
