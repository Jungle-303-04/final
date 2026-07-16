import type { ResourceActionReceipt } from "../resources/resourceCapabilitiesContract";

export type ServiceRequestScheme = "http" | "https";
export type ServiceAccessAvailability = "available" | "forbidden" | "unavailable";

export interface ServiceAccessScope {
  workspaceId: string;
  clusterId: string;
  namespaces: string[];
  freshness: "live" | "stale" | "partial" | "disconnected";
}

export interface ServiceResourceRef {
  apiGroup: string;
  version: string;
  kind: string;
  namespace: string;
  name: string;
  uid: string;
}

export interface ServiceAccessPortDescriptor {
  port: number;
  name: string | null;
  protocol: "TCP";
  appProtocol: string | null;
  defaultScheme: ServiceRequestScheme;
}

export interface ServiceAccessCapabilities {
  scope: ServiceAccessScope;
  resource: ServiceResourceRef;
  revision: string;
  serviceRequest: ServiceAccessAvailability;
  serviceRequestReason: string | null;
  localPortForward: "desktop-required";
  localPortForwardReason: "desktop-port-forward-bridge-required";
  ports: ServiceAccessPortDescriptor[];
}

export interface StartServiceRequestInput {
  port: number;
  scheme: ServiceRequestScheme;
  path: string;
  reason: string;
}

export interface ServiceAccessPort {
  resolve(resourceId: string, signal?: AbortSignal): Promise<ServiceAccessCapabilities>;
  start(
    capabilities: ServiceAccessCapabilities,
    input: StartServiceRequestInput,
    signal?: AbortSignal,
  ): Promise<ResourceActionReceipt>;
  cancel(commandId: string, signal?: AbortSignal): Promise<void>;
}

export const EMPTY_SERVICE_ACCESS_PORT: ServiceAccessPort = {
  resolve: () => Promise.reject(new Error("service access port is inactive")),
  start: () => Promise.reject(new Error("service access port is inactive")),
  cancel: () => Promise.reject(new Error("service access port is inactive")),
};

export interface ServiceRequestOperationResult {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  bodyBytes: number;
  error: string | null;
}
