import type {
  HelmChartSource,
  HelmChartSourceDeleteReceipt,
  HelmChartSourceDeleteRequest,
  HelmChartSourceListRequest,
  HelmChartSourcePage,
  HelmChartSourceRegisterRequest,
  HelmRepositoryRefreshReceipt,
} from "./helmChartSourcesContract";

export type {
  HelmChartSource,
  HelmChartSourceAction,
  HelmChartSourceCredential,
  HelmChartSourceDeleteReceipt,
  HelmChartSourceDeleteRequest,
  HelmChartSourceListRequest,
  HelmChartSourcePage,
  HelmChartSourceProvider,
  HelmChartSourceRegisterRequest,
  HelmChartSourceStatus,
  HelmRepositoryRefreshReceipt,
} from "./helmChartSourcesContract";

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
  actions: readonly ["upgrade", "rollback", "uninstall"];
  confirmationRequired: true;
  realtime: true;
  upgradeTargets: readonly HelmUpgradeTarget[];
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

export type HelmResourceHealth = HelmResourceHealthAvailability | HelmResourceHealthObservation;

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

export type HelmOwnedResources = HelmUnavailableFeature | HelmOwnedResourceObservation;

export type HelmArtifactKind =
  | "manifest"
  | "values"
  | "manifest_diff"
  | "values_diff"
  | "notes_diff"
  | "hooks_diff"
  | "resources_diff";

export interface HelmArtifactReadRequest extends HelmReleaseDetailRequest {
  artifact: HelmArtifactKind;
  revision: number;
  comparisonRevision?: number;
  allValues?: boolean;
}

export interface HelmArtifactReceipt {
  accepted: true;
  eventId: string;
  auditEventId: string;
  correlationId: string;
  commandId: string;
  status: "queued" | "leased" | "running" | "cancel_requested" | "cancelling" | "completed" | "failed" | "cancelled";
}

export type HelmReleaseUpgradeReceipt = HelmArtifactReceipt;

interface HelmArtifactResultBase {
  artifact: HelmArtifactKind;
  namespace: string;
  releaseName: string;
  revision: number;
  comparisonRevision: number | null;
  allValues: boolean;
  sourceBytes: number;
  redactionApplied: true;
  truncated: boolean;
}

export interface HelmTextArtifactResult extends HelmArtifactResultBase {
  artifact: "manifest" | "values" | "manifest_diff" | "values_diff" | "notes_diff";
  format: "yaml" | "unified-diff";
  content: string;
  contentSha256: string;
  contentBytes: number;
}

export interface HelmHookDiffItem {
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
  events: readonly string[];
  weight: number;
  deletePolicies: readonly string[];
  outputLogPolicies: readonly string[];
  manifestChanged: boolean;
}

export interface HelmHooksDiff {
  revision1: number;
  revision2: number;
  added: readonly HelmHookDiffItem[];
  removed: readonly HelmHookDiffItem[];
  modified: readonly HelmHookDiffItem[];
  unchanged: readonly HelmHookDiffItem[];
  parseErrorCount: number;
}

export interface HelmHooksDiffArtifactResult extends HelmArtifactResultBase {
  artifact: "hooks_diff";
  format: "structured";
  projectionSha256: string;
  projectionBytes: number;
  hooksDiff: HelmHooksDiff;
}

export interface HelmRenderedResourceRef {
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
}

export type HelmResourceFieldValue = string | number | boolean | null;

export interface HelmResourceFieldChange {
  path: string;
  oldValue: HelmResourceFieldValue;
  newValue: HelmResourceFieldValue;
}

export interface HelmRenderedResourceChange extends HelmRenderedResourceRef {
  summary: string;
  fieldCount: number;
  fields: readonly HelmResourceFieldChange[];
}

export interface HelmResourcesDiff {
  revision1: number;
  revision2: number;
  added: readonly HelmRenderedResourceRef[];
  removed: readonly HelmRenderedResourceRef[];
  modified: readonly HelmRenderedResourceChange[];
  unchanged: readonly HelmRenderedResourceRef[];
  parseErrorCount: number;
}

export type HelmValuesPreviewResources = Omit<HelmResourcesDiff, "revision1" | "revision2">;

export interface HelmValuesPreviewResult {
  namespace: string;
  releaseName: string;
  expectedRevision: number;
  catalogItemId: string;
  catalogVersion: string;
  chartName: string;
  chartVersion: string;
  resources: HelmValuesPreviewResources;
  projectionSha256: string;
  projectionBytes: number;
  sourceBytes: number;
  redactionApplied: true;
  truncated: boolean;
}

export interface HelmResourcesDiffArtifactResult extends HelmArtifactResultBase {
  artifact: "resources_diff";
  format: "structured";
  projectionSha256: string;
  projectionBytes: number;
  resourcesDiff: HelmResourcesDiff;
}

export type HelmArtifactResult =
  | HelmTextArtifactResult
  | HelmHooksDiffArtifactResult
  | HelmResourcesDiffArtifactResult;

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
  storageResourceVersion: string | null;
  chart: string | null;
  chartVersion: string | null;
  chartReasonCodes: readonly string[];
  appVersion: null;
  status: string | null;
  revision: number | null;
  observedAt: string | null;
  resourceHealth: HelmResourceHealth;
}

export interface HelmChartVersion {
  version: string;
  appVersion: string | null;
  deprecated: boolean;
}

export interface HelmReleaseUpgradeInfo {
  availability: HelmAvailability;
  chartName: string | null;
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  source: HelmChartSource | null;
  observedAt: string | null;
  reasonCodes: readonly string[];
  refreshAfterSeconds: number;
}

export interface HelmReleaseVersionList {
  availability: HelmAvailability;
  chartName: string | null;
  currentVersion: string | null;
  source: HelmChartSource | null;
  versions: readonly HelmChartVersion[];
  observedAt: string | null;
  truncated: boolean;
  reasonCodes: readonly string[];
  refreshAfterSeconds: number;
}

export interface HelmReleaseUpgradeBatch {
  releases: Readonly<Record<string, HelmReleaseUpgradeInfo>>;
  coverage: HelmObservationCoverage;
  truncated: boolean;
  reasonCodes: readonly string[];
  refreshAfterSeconds: number;
}

export interface ArtifactHubChart {
  packageId: string;
  name: string;
  version: string;
  appVersion: string | null;
  description: string | null;
  stars: number;
  deprecated: boolean;
  signed: boolean;
  repository: {
    name: string;
    url: string;
    official: boolean;
    verifiedPublisher: boolean;
  };
}

export interface ArtifactHubSearchRequest {
  query: string;
  offset?: number;
  limit?: number;
  sort?: "relevance" | "stars" | "last_updated";
  official?: boolean;
  verified?: boolean;
}

export interface ArtifactHubSearchPage {
  items: readonly ArtifactHubChart[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  observedAt: string;
}

export interface ArtifactHubChartDetail {
  chart: ArtifactHubChart;
  readme: string | null;
  availableVersions: readonly { version: string; appVersion: string | null }[];
  versionsTruncated: boolean;
  observedAt: string;
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
  commands: HelmUnavailableFeature | HelmReleaseCommands;
  refreshAfterSeconds: number;
  postMutationRefreshAfterSeconds: number;
}

export interface HelmReleaseList {
  releases: readonly HelmRelease[];
  coverage: HelmObservationCoverage;
  refreshAfterSeconds: number;
  postMutationRefreshAfterSeconds: number;
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

export interface HelmReleaseUpgradeRequest extends HelmReleaseDetailRequest {
  expectedRevision: number;
  catalogItemId: string;
  catalogVersion: string;
  values: Readonly<Record<string, unknown>>;
  confirmation: true;
  reason?: string;
}

export type HelmReleaseValuesPreviewRequest = Omit<
  HelmReleaseUpgradeRequest,
  "confirmation" | "reason"
>;

export interface HelmInstallTargets {
  namespace: string;
  targets: readonly HelmUpgradeTarget[];
}

export interface HelmReleaseInstallRequest {
  clusterId: string;
  namespace: string;
  applicationName: string;
  releaseName: string;
  catalogItemId: string;
  catalogVersion: string;
  values: Readonly<Record<string, unknown>>;
  confirmation: true;
  idempotencyKey: string;
}

export interface HelmInstallReceipt {
  accepted: true;
  eventId: string;
  auditEventId: string;
  commandId: string;
  correlationId: string;
  status: string;
}

export interface HelmReleaseRollbackRequest extends HelmReleaseDetailRequest {
  expectedRevision: number;
  revision: number;
  confirmation: true;
  reason?: string;
}

export interface HelmReleaseUninstallRequest extends HelmReleaseDetailRequest {
  expectedRevision: number;
  confirmation: true;
  reason?: string;
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
  listInstallTargets(signal?: AbortSignal): Promise<HelmInstallTargets>;
  installRelease(
    request: HelmReleaseInstallRequest,
    signal?: AbortSignal,
  ): Promise<HelmInstallReceipt>;
  searchArtifactHub(
    request: ArtifactHubSearchRequest,
    signal?: AbortSignal,
  ): Promise<ArtifactHubSearchPage>;
  getArtifactHubChart(
    request: { repository: string; chart: string; version?: string },
    signal?: AbortSignal,
  ): Promise<ArtifactHubChartDetail>;
  listReleases(request: HelmReleaseListRequest, signal?: AbortSignal): Promise<HelmReleaseList>;
  getRelease(request: HelmReleaseDetailRequest, signal?: AbortSignal): Promise<HelmReleaseDetail>;
  getReleaseUpgradeInfo(
    request: HelmReleaseDetailRequest,
    signal?: AbortSignal,
  ): Promise<HelmReleaseUpgradeInfo>;
  listReleaseVersions(
    request: HelmReleaseDetailRequest,
    signal?: AbortSignal,
  ): Promise<HelmReleaseVersionList>;
  checkReleaseUpgrades(
    request: HelmReleaseListRequest,
    signal?: AbortSignal,
  ): Promise<HelmReleaseUpgradeBatch>;
  readArtifact(
    request: HelmArtifactReadRequest,
    signal?: AbortSignal,
  ): Promise<HelmArtifactReceipt>;
  previewReleaseValues(
    request: HelmReleaseValuesPreviewRequest,
    signal?: AbortSignal,
  ): Promise<HelmArtifactReceipt>;
  upgradeRelease(
    request: HelmReleaseUpgradeRequest,
    signal?: AbortSignal,
  ): Promise<HelmReleaseUpgradeReceipt>;
  rollbackRelease(
    request: HelmReleaseRollbackRequest,
    signal?: AbortSignal,
  ): Promise<HelmReleaseUpgradeReceipt>;
  uninstallRelease(
    request: HelmReleaseUninstallRequest,
    signal?: AbortSignal,
  ): Promise<HelmReleaseUpgradeReceipt>;
  listChartSources(
    request?: HelmChartSourceListRequest,
    signal?: AbortSignal,
  ): Promise<HelmChartSourcePage>;
  registerChartSource(
    request: HelmChartSourceRegisterRequest,
    signal?: AbortSignal,
  ): Promise<HelmChartSource>;
  deleteChartSource(
    request: HelmChartSourceDeleteRequest,
    signal?: AbortSignal,
  ): Promise<HelmChartSourceDeleteReceipt>;
  refreshChartSource(
    name: string,
    signal?: AbortSignal,
  ): Promise<HelmRepositoryRefreshReceipt>;
}
