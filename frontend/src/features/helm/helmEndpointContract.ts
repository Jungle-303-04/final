// Hand-written wire-shape contract for the Helm release endpoints.
//
// These interfaces MUST stay structurally identical to the inferred output of the
// Zod schemas in `src/api/helm-releases-schemas.ts`, but this file deliberately does
// NOT import from `../../api` — the architecture keeps feature endpoint contracts
// decoupled from the api/zod layer (that coupling is enforced by apiBoundary.test.ts,
// and structural drift is caught by the api-side schema + contract test).

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

export interface HelmEndpointResourceHealthAvailability {
  availability: "unavailable";
  reason_code: string;
  health: null;
}

export interface HelmEndpointResourceHealthObservation {
  availability: "available" | "partial";
  health: string;
  resource_count: number;
  observed_at: string | null;
  reason_codes: string[];
}

export type HelmEndpointResourceHealth =
  | HelmEndpointResourceHealthObservation
  | HelmEndpointResourceHealthAvailability;

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

export type HelmEndpointOwnedResources =
  | HelmEndpointOwnedResourceObservation
  | HelmEndpointUnavailableFeature;

export interface HelmEndpointUpgradeInput {
  name: string;
  value_type: "string" | "integer" | "number" | "boolean";
  required: boolean;
  default: string | number | boolean | null;
  allowed_values: (string | number | boolean | null)[];
}

export interface HelmEndpointUpgradeTarget {
  item_id: string;
  name: string;
  version: string;
  chart_version: string;
  inputs: HelmEndpointUpgradeInput[];
}

export interface HelmEndpointReleaseCommands {
  availability: "available";
  actions: ("upgrade" | "rollback" | "uninstall")[];
  confirmation_required: true;
  realtime: true;
  upgrade_targets: HelmEndpointUpgradeTarget[];
}

export type HelmEndpointCommands =
  | HelmEndpointUnavailableFeature
  | HelmEndpointReleaseCommands;

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
  resource_health: HelmEndpointResourceHealth;
}

export interface HelmEndpointHistoryEntry {
  storage: HelmEndpointResourceRef;
  revision: number | null;
  status: string | null;
  observed_at: string | null;
}

export interface HelmEndpointObservationCoverage {
  availability: "available" | "partial" | "unavailable";
  observed_at: string | null;
  reason_codes: string[];
}

export interface HelmEndpointDetail {
  release: HelmEndpointRelease;
  history: HelmEndpointHistoryEntry[];
  manifest: HelmEndpointUnavailableFeature;
  values: HelmEndpointUnavailableFeature;
  owned_resources: HelmEndpointOwnedResources;
  commands: HelmEndpointCommands;
}

export interface HelmReleaseListEndpoint {
  releases: HelmEndpointRelease[];
  coverage: HelmEndpointObservationCoverage;
  refresh_after_seconds: number;
  post_mutation_refresh_after_seconds: number;
}

export interface HelmReleaseDetailEndpoint {
  detail: HelmEndpointDetail;
  refresh_after_seconds: number;
  post_mutation_refresh_after_seconds: number;
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
