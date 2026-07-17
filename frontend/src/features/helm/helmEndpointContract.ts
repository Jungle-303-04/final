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

export interface HelmEndpointUpgradeInput {
  name: string;
  value_type: "string" | "integer" | "number" | "boolean";
  required: boolean;
  default: string | number | boolean | null;
  allowed_values: Array<string | number | boolean | null>;
}

export interface HelmEndpointReleaseCommands {
  availability: "available";
  actions: ["upgrade", "rollback", "uninstall"];
  confirmation_required: true;
  realtime: true;
  upgrade_targets: Array<{
    item_id: string;
    name: string;
    version: string;
    chart_version: string;
    inputs: HelmEndpointUpgradeInput[];
  }>;
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
  storage_resource_version: string | null;
  chart: string | null;
  chart_version: string | null;
  chart_reason_codes: string[];
  app_version: null;
  status: string | null;
  revision: number | null;
  observed_at: string | null;
  resource_health:
    | (HelmEndpointUnavailableFeature & { health: null })
    | HelmEndpointResourceHealthObservation;
}

export interface HelmEndpointChartVersion {
  version: string;
  app_version: string | null;
  deprecated: boolean;
}

export interface HelmReleaseUpgradeInfoEndpoint {
  availability: "available" | "partial" | "unavailable";
  chart_name: string | null;
  current_version: string | null;
  latest_version: string | null;
  update_available: boolean | null;
  source: HelmChartSourceEndpoint | null;
  observed_at: string | null;
  reason_codes: string[];
  refresh_after_seconds: number;
}

export interface HelmReleaseVersionListEndpoint {
  availability: "available" | "partial" | "unavailable";
  chart_name: string | null;
  current_version: string | null;
  source: HelmChartSourceEndpoint | null;
  versions: HelmEndpointChartVersion[];
  observed_at: string | null;
  truncated: boolean;
  reason_codes: string[];
  refresh_after_seconds: number;
}

export interface HelmReleaseUpgradeBatchEndpoint {
  releases: Record<string, HelmReleaseUpgradeInfoEndpoint>;
  coverage: HelmReleaseListEndpoint["coverage"];
  truncated: boolean;
  reason_codes: string[];
  refresh_after_seconds: number;
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
    commands: HelmEndpointUnavailableFeature | HelmEndpointReleaseCommands;
  };
}

export interface HelmChartSourceEndpoint {
  source_id: string;
  provider: "repository" | "oci";
  name: string;
  reference: string;
  status: "active" | "disabled";
  actions: Array<"refresh" | "delete">;
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
  getHelmReleaseUpgradeInfo(
    input: { clusterId: string; namespace: string; releaseName: string },
    signal?: AbortSignal,
  ): Promise<HelmReleaseUpgradeInfoEndpoint>;
  listHelmReleaseVersions(
    input: { clusterId: string; namespace: string; releaseName: string },
    signal?: AbortSignal,
  ): Promise<HelmReleaseVersionListEndpoint>;
  checkHelmReleaseUpgrades(
    query: { clusterIds?: readonly string[]; namespaces?: readonly string[] },
    signal?: AbortSignal,
  ): Promise<HelmReleaseUpgradeBatchEndpoint>;
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
  startHelmReleaseUpgrade(
    input: {
      clusterId: string;
      namespace: string;
      releaseName: string;
      expectedRevision: number;
      catalogItemId: string;
      catalogVersion: string;
      values: Readonly<Record<string, unknown>>;
      confirmation: true;
      reason?: string;
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
  startHelmReleaseRollback(
    input: {
      clusterId: string;
      namespace: string;
      releaseName: string;
      expectedRevision: number;
      revision: number;
      confirmation: true;
      reason?: string;
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
  startHelmReleaseUninstall(
    input: {
      clusterId: string;
      namespace: string;
      releaseName: string;
      expectedRevision: number;
      confirmation: true;
      reason?: string;
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
  refreshHelmRepository(
    name: string,
    signal?: AbortSignal,
  ): Promise<{
    source_id: string;
    chart_count: number;
    observed_at: string;
    event_id: string;
    correlation_id: string;
  }>;
}
