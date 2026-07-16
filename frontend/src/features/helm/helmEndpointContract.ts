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

export interface HelmEndpointResourceHealthObservation {
  availability: "available" | "partial";
  health: string;
  resource_count: number;
  observed_at: string | null;
  reason_codes: string[];
}

export interface HelmEndpointOwnedResource {
  resource: HelmEndpointResourceRef;
  status: string;
  health: string;
  observed_at: string | null;
}

export interface HelmEndpointOwnedResourceObservation {
  availability: "available" | "partial";
  items: HelmEndpointOwnedResource[];
  observed_at: string | null;
  truncated: boolean;
  reason_codes: string[];
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
  resource_health:
    | (HelmEndpointUnavailableFeature & { health: null })
    | HelmEndpointResourceHealthObservation;
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
    owned_resources: HelmEndpointUnavailableFeature | HelmEndpointOwnedResourceObservation;
    commands: HelmEndpointUnavailableFeature;
  };
}

export interface HelmChartSourceEndpoint {
  source_id: string;
  provider: "repository" | "oci";
  name: string;
  reference: string;
  status: "active" | "disabled";
  actions: Array<"delete">;
  credentials_configured: boolean;
  observed_at: string | null;
}

export interface HelmChartSourcePageEndpoint {
  items: HelmChartSourceEndpoint[];
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
}

export type HelmChartSourceCredentialEndpointInput =
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; password: string };

export interface HelmChartSourceRegisterEndpointInput {
  provider: "repository" | "oci";
  name: string;
  reference: string;
  credential?: HelmChartSourceCredentialEndpointInput;
}

export interface HelmChartSourceDeleteEndpointInput {
  provider: "repository" | "oci";
  name: string;
  reference: string;
}

export interface HelmConfigMutationEndpointReceipt {
  accepted: true;
  event_id: string;
  correlation_id: string;
  command_id: null;
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
  startHelmArtifactRead(
    input: {
      clusterId: string;
      namespace: string;
      releaseName: string;
      artifact:
        | "manifest"
        | "values"
        | "manifest_diff"
        | "values_diff"
        | "notes_diff"
        | "hooks_diff"
        | "resources_diff";
      revision: number;
      comparisonRevision?: number;
      allValues?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<{
    accepted: true;
    event_id: string;
    audit_event_id: string;
    correlation_id: string;
    command_id: string;
    status: "queued" | "leased" | "running" | "cancel_requested" | "cancelling" | "completed" | "failed" | "cancelled";
  }>;
  listHelmChartSources(
    query?: { limit?: number; cursor?: string },
    signal?: AbortSignal,
  ): Promise<HelmChartSourcePageEndpoint>;
  registerHelmChartSource(
    input: HelmChartSourceRegisterEndpointInput,
    signal?: AbortSignal,
  ): Promise<HelmChartSourceEndpoint>;
  deleteHelmChartSource(
    sourceId: string,
    input: HelmChartSourceDeleteEndpointInput,
    signal?: AbortSignal,
  ): Promise<HelmConfigMutationEndpointReceipt>;
}
