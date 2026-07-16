export type CompareAvailability = "available" | "partial" | "unavailable";
export type CompareFreshness = "live" | "stale" | "partial" | "disconnected";
export type ComparePresentationMode = "side-by-side" | "unified";

export interface CompareTarget {
  namespace: string | null;
  name: string;
}

export interface CompareRequest {
  clusterId: string;
  kind: string;
  apiGroup: string;
  apiVersion: string | null;
  a: CompareTarget;
  b: CompareTarget;
}

export interface CompareIdentityRequest {
  clusterId: string;
  kind: string;
  apiGroup: string;
  apiVersion: string | null;
}

export interface CompareResourceRef {
  apiGroup: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface CompareDescriptor {
  routeKind: string;
  apiGroup: string;
  apiVersion: string;
  kubernetesKind: string;
  resourceType: string;
  projectionKind: "workload_replicas" | "service_ports";
}

export interface CompareProvenance {
  observationSnapshotId: string;
  latestSnapshotId: string;
  observedAt: string | null;
  availability: CompareAvailability;
  reasonCodes: readonly string[];
}

export interface CompareWorkloadProjection {
  projectionKind: "workload_replicas";
  replicas: number | null;
}

export interface CompareServicePort {
  name: string | null;
  port: number;
  protocol: "TCP" | "UDP" | "SCTP" | null;
  targetPortName: string | null;
  targetPortNumber: number | null;
  nodePort: number | null;
}

export interface CompareServiceProjection {
  projectionKind: "service_ports";
  serviceType: "ClusterIP" | "NodePort" | "LoadBalancer" | "ExternalName" | null;
  ports: readonly CompareServicePort[];
  excludedPortCount: number;
}

export type CompareProjection = CompareWorkloadProjection | CompareServiceProjection;

export interface ComparableManifest {
  resource: CompareResourceRef;
  metadata: CompareTarget;
  projection: CompareProjection;
  provenance: CompareProvenance;
  omittedPaths: readonly string[];
}

export interface CompareCoverage {
  availability: CompareAvailability;
  latestSnapshotId: string;
  reasonCodes: readonly string[];
}

export interface CompareResult {
  scope: {
    workspaceId: string;
    clusterId: string;
    namespaces: readonly string[];
    freshness: CompareFreshness;
  };
  descriptor: CompareDescriptor;
  coverage: CompareCoverage;
  presentation: {
    modes: readonly ComparePresentationMode[];
    swap: true;
    diffOnly: true;
  };
  a: ComparableManifest;
  b: ComparableManifest;
}

export interface CompareCandidates {
  scope: CompareResult["scope"];
  descriptor: CompareDescriptor;
  coverage: CompareCoverage;
  candidates: readonly {
    resource: CompareResourceRef;
    provenance: CompareProvenance;
  }[];
  excludedCount: number;
}

export type CompareFailureCode =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "identity-incomplete"
  | "unsupported"
  | "unavailable"
  | "invalid-request"
  | "invalid-response"
  | "offline"
  | "rate-limited"
  | "error";

export class ComparePortFailure extends Error {
  constructor(readonly code: CompareFailureCode) {
    super(`Compare port failed: ${code}`);
    this.name = "ComparePortFailure";
  }
}

export interface ComparePort {
  getComparison(request: CompareRequest, signal?: AbortSignal): Promise<CompareResult>;
  getCandidates(request: CompareIdentityRequest, signal?: AbortSignal): Promise<CompareCandidates>;
}

export const EMPTY_COMPARE_PORT: ComparePort = {
  async getComparison() {
    throw new ComparePortFailure("unavailable");
  },
  async getCandidates() {
    throw new ComparePortFailure("unavailable");
  },
};
