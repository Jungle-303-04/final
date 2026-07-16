/**
 * Transport shape consumed by the Compare adapter after the API boundary has
 * validated the response. Keeping it local prevents feature code from taking
 * a dependency on API-layer Zod schema modules.
 */
export type CompareWireAvailability = "available" | "partial" | "unavailable";
export type CompareWireFreshness = "live" | "stale" | "partial" | "disconnected";

export interface CompareWireScope {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: CompareWireFreshness;
}

export interface CompareWireDescriptor {
  route_kind: string;
  api_group: string;
  api_version: string;
  kubernetes_kind: string;
  resource_type: string;
  projection_kind: "workload_replicas" | "service_ports";
}

export interface CompareWireResourceRef {
  api_group: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface CompareWireProvenance {
  source_kind: "inventory_snapshot";
  observation_snapshot_id: string;
  latest_snapshot_id: string;
  observed_at: string | null;
  availability: CompareWireAvailability;
  reason_codes: string[];
}

export type CompareWireProjection =
  | { projection_kind: "workload_replicas"; replicas: number | null }
  | {
    projection_kind: "service_ports";
    service_type: "ClusterIP" | "NodePort" | "LoadBalancer" | "ExternalName" | null;
    ports: CompareWireServicePort[];
    excluded_port_count: number;
  };

export interface CompareWireServicePort {
  name: string | null;
  port: number;
  protocol: "TCP" | "UDP" | "SCTP" | null;
  target_port_name: string | null;
  target_port_number: number | null;
  node_port: number | null;
}

export interface CompareWireManifest {
  projection_version: "safe-manifest-v1";
  resource: CompareWireResourceRef;
  metadata: { name: string; namespace: string | null };
  projection: CompareWireProjection;
  provenance: CompareWireProvenance;
  omitted_paths: string[];
}

export interface CompareWireCoverage {
  availability: CompareWireAvailability;
  latest_snapshot_id: string;
  reason_codes: string[];
}

export interface CompareResourcePairEndpoint {
  comparison: {
    scope: CompareWireScope;
    descriptor: CompareWireDescriptor;
    coverage: CompareWireCoverage;
    presentation: { modes: ("side-by-side" | "unified")[]; swap: true; diff_only: true };
    a: CompareWireManifest;
    b: CompareWireManifest;
  };
}

export interface CompareCandidateListEndpoint {
  result: {
    scope: CompareWireScope;
    descriptor: CompareWireDescriptor;
    coverage: CompareWireCoverage;
    candidates: { resource: CompareWireResourceRef; provenance: CompareWireProvenance }[];
    excluded_count: number;
  };
}
