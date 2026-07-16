export interface HelmEndpointClusterScope {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: "live" | "stale" | "partial" | "disconnected";
}

export interface HelmEndpointResourceRef {
  api_group: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface HelmEndpointUnavailableFeature {
  availability: "unavailable";
  reason_code: string;
}

export interface HelmEndpointRelease {
  scope: HelmEndpointClusterScope;
  name: string;
  storage_namespace: string;
  storage: HelmEndpointResourceRef;
  chart: null;
  app_version: null;
  status: string | null;
  revision: number | null;
  observed_at: string | null;
  resource_health: HelmEndpointUnavailableFeature & { health: null };
}

export interface HelmReleaseListEndpoint {
  releases: HelmEndpointRelease[];
  refresh_after_seconds: number;
  post_mutation_refresh_after_seconds: number;
  coverage: {
    availability: "available" | "partial" | "unavailable";
    observed_at: string | null;
    reason_codes: string[];
  };
}

export interface HelmReleaseDetailEndpoint {
  refresh_after_seconds: number;
  post_mutation_refresh_after_seconds: number;
  detail: {
    release: HelmEndpointRelease;
    history: {
      storage: HelmEndpointResourceRef;
      revision: number | null;
      status: string | null;
      observed_at: string | null;
    }[];
    manifest: HelmEndpointUnavailableFeature;
    values: HelmEndpointUnavailableFeature;
    owned_resources: HelmEndpointUnavailableFeature;
    commands: HelmEndpointUnavailableFeature;
  };
}

export interface HelmEndpointDependencies {
  listHelmReleases(
    query: { clusterIds?: readonly string[]; namespaces?: readonly string[] },
    signal?: AbortSignal,
  ): Promise<HelmReleaseListEndpoint>;
  getHelmRelease(
    input: { clusterId: string; namespace: string; releaseName: string },
    signal?: AbortSignal,
  ): Promise<HelmReleaseDetailEndpoint>;
}
