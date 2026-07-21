export type HelmAvailability = "available" | "partial" | "unavailable";
export type HelmFreshness = "live" | "stale" | "partial" | "disconnected";

export interface HelmClusterScope {
  workspaceId: string;
  clusterId: string;
  namespaces: readonly string[];
  freshness: HelmFreshness;
}

export interface HelmResourceRef {
  apiGroup: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface HelmUnavailableFeature {
  availability: "unavailable";
  reasonCode: string;
}

export interface HelmResourceHealthAvailability extends HelmUnavailableFeature {
  health: null;
}

export interface HelmResourceHealthObservation {
  availability: "available" | "partial";
  health: string;
  resourceCount: number;
  observedAt: string | null;
  reasonCodes: readonly string[];
}

export type HelmResourceHealth = HelmResourceHealthObservation | HelmResourceHealthAvailability;

export interface HelmOwnedResource {
  resource: HelmResourceRef;
  status: string;
  health: string;
  observedAt: string | null;
}

export interface HelmOwnedResourceObservation {
  availability: "available" | "partial";
  items: readonly HelmOwnedResource[];
  observedAt: string | null;
  truncated: boolean;
  reasonCodes: readonly string[];
}

export type HelmOwnedResources = HelmOwnedResourceObservation | HelmUnavailableFeature;

export type HelmUpgradeValueType = "string" | "integer" | "number" | "boolean";
export type HelmUpgradeScalar = string | number | boolean | null;

export interface HelmUpgradeInput {
  name: string;
  valueType: HelmUpgradeValueType;
  required: boolean;
  defaultValue: HelmUpgradeScalar;
  allowedValues: readonly HelmUpgradeScalar[];
}

export interface HelmUpgradeTarget {
  itemId: string;
  name: string;
  version: string;
  chartVersion: string;
  inputs: readonly HelmUpgradeInput[];
}

export interface HelmReleaseCommands {
  availability: "available";
  actions: readonly ("upgrade" | "rollback" | "uninstall")[];
  confirmationRequired: true;
  realtime: true;
  upgradeTargets: readonly HelmUpgradeTarget[];
}

export type HelmCommands = HelmReleaseCommands | HelmUnavailableFeature;

export interface HelmObservationCoverage {
  availability: HelmAvailability;
  observedAt: string | null;
  reasonCodes: readonly string[];
}

export interface HelmRelease {
  scope: HelmClusterScope;
  name: string;
  storageNamespace: string;
  storage: HelmResourceRef;
  chart: string | null;
  appVersion: null;
  status: string | null;
  revision: number | null;
  observedAt: string | null;
  resourceHealth: HelmResourceHealth;
}

export interface HelmReleaseHistoryEntry {
  storage: HelmResourceRef;
  revision: number | null;
  status: string | null;
  observedAt: string | null;
}

export interface HelmReleaseDetail {
  release: HelmRelease;
  history: readonly HelmReleaseHistoryEntry[];
  manifest: HelmUnavailableFeature;
  values: HelmUnavailableFeature;
  ownedResources: HelmOwnedResources;
  commands: HelmCommands;
}

export interface HelmReleaseList {
  releases: readonly HelmRelease[];
  coverage: HelmObservationCoverage;
}

export interface HelmReleaseListRequest {
  clusterIds: readonly string[];
  namespaces?: readonly string[];
}

export interface HelmReleaseDetailRequest {
  clusterId: string;
  namespace: string;
  releaseName: string;
}

export type HelmFailureCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-request"
  | "invalid-response"
  | "not-found"
  | "offline"
  | "rate-limited"
  | "error";

export class HelmPortFailure extends Error {
  readonly code: HelmFailureCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: HelmFailureCode, retryAfterSeconds: number | null = null) {
    super(`Helm port failed: ${code}`);
    this.name = "HelmPortFailure";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface HelmPort {
  listReleases(request: HelmReleaseListRequest, signal?: AbortSignal): Promise<HelmReleaseList>;
  getRelease(request: HelmReleaseDetailRequest, signal?: AbortSignal): Promise<HelmReleaseDetail>;
}
