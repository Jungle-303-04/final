import type { BrowserRefreshPolicy } from "../../shared/data/browserRefreshPolicyRegistry";
import type { ResourceRef } from "../../shared/parity/referenceParity";

export type ChecksAvailability = "available" | "partial" | "unavailable";
export type ChecksFreshness = "live" | "stale" | "partial" | "disconnected";

export interface ChecksClusterScope {
  workspaceId: string;
  clusterId: string;
  namespaces: readonly string[];
  freshness: ChecksFreshness;
}

export interface ChecksScopeCoverage {
  availability: ChecksAvailability;
  scopes: readonly ChecksClusterScope[];
  observedAt: string | null;
  reasonCodes: readonly string[];
}

export interface ChecksUnavailableResultSet {
  availability: "unavailable";
  evaluatedAt: null;
  checks: null;
  totalCheckCount: null;
  totalFindingCount: null;
  reasonCodes: readonly string[];
}

export type ChecksSeverity = "warning" | "danger";

export interface ChecksFinding {
  findingId: string;
  clusterId: string;
  checkId: string;
  category: string;
  severity: ChecksSeverity;
  message: string;
  resource: ResourceRef;
}

export interface ChecksObservedResultSet {
  availability: "available" | "partial";
  evaluatedAt: string;
  checks: readonly ChecksFinding[];
  totalCheckCount: number;
  totalFindingCount: number;
  reasonCodes: readonly string[];
}

export type ChecksResultSet = ChecksObservedResultSet | ChecksUnavailableResultSet;

export interface ChecksUnavailableCatalog {
  availability: "unavailable";
  entries: null;
  reasonCodes: readonly string[];
}

export interface ChecksCatalogEntry {
  checkId: string;
  title: string;
  category: string;
  severity: ChecksSeverity;
  description: string;
  remediation: string;
}

export interface ChecksObservedCatalog {
  availability: "available" | "partial";
  entries: readonly ChecksCatalogEntry[];
  reasonCodes: readonly string[];
}

export type ChecksCatalog = ChecksObservedCatalog | ChecksUnavailableCatalog;

export interface ChecksVisibility {
  clusterId: string;
  state: "ok" | "limited" | "degraded";
  namespaceScope: readonly string[];
  core: Readonly<Record<string, "allowed" | "namespace_limited" | "unavailable">>;
  missingOptionalKinds: readonly string[];
}

export interface ChecksVisibilitySummary {
  availability: ChecksAvailability;
  clusters: readonly ChecksVisibility[];
  reasonCodes: readonly string[];
}

export interface ChecksOverview {
  scopeCoverage: ChecksScopeCoverage;
  resultSet: ChecksResultSet;
  catalog: ChecksCatalog;
  visibility: ChecksVisibilitySummary;
}

export interface ChecksUnavailableDetail {
  requestedCheckId: string;
  availability: "unavailable";
  title: null;
  category: null;
  effectiveSeverity: null;
  message: null;
  remediation: null;
  affectedResourceCount: null;
  findings: null;
  reasonCodes: readonly string[];
}

export interface ChecksObservedDetail {
  requestedCheckId: string;
  availability: "available" | "partial";
  title: string;
  category: string;
  effectiveSeverity: ChecksSeverity;
  message: string;
  remediation: string;
  affectedResourceCount: number;
  findings: readonly ChecksFinding[];
  reasonCodes: readonly string[];
}

export type ChecksDetail = ChecksObservedDetail | ChecksUnavailableDetail;

export interface ChecksDetailResponse {
  scopeCoverage: ChecksScopeCoverage;
  detail: ChecksDetail;
}

export interface ChecksRequest {
  clusterIds: readonly string[];
  namespaces: readonly string[];
  resource?: ResourceRef;
}

export interface ChecksSettingsPolicy {
  hiddenCheckIds: readonly string[];
  hiddenCategories: readonly string[];
  hiddenNamespaces: readonly string[];
}

export interface ChecksSettings {
  workspaceId: string;
  userId: string;
  policy: ChecksSettingsPolicy;
  revision: number;
  invalidationGeneration: number;
  canEdit: boolean;
  updatedAt: string | null;
}

export interface ChecksSettingsUpdateReceipt extends ChecksSettings {
  eventId: string;
  auditEventId: string;
}

export type ChecksFailureCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-request"
  | "invalid-response"
  | "not-found"
  | "offline"
  | "rate-limited"
  | "conflict"
  | "error";

export class ChecksPortFailure extends Error {
  readonly code: ChecksFailureCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: ChecksFailureCode, retryAfterSeconds: number | null = null) {
    super(`Checks port failed: ${code}`);
    this.name = "ChecksPortFailure";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface ChecksPort {
  loadRefreshPolicy(signal?: AbortSignal): Promise<BrowserRefreshPolicy>;
  getOverview(request: ChecksRequest, signal?: AbortSignal): Promise<ChecksOverview>;
  getDetail(checkId: string, request: ChecksRequest, signal?: AbortSignal): Promise<ChecksDetailResponse>;
  getSettings(signal?: AbortSignal): Promise<ChecksSettings>;
  updateSettings(
    policy: ChecksSettingsPolicy,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<ChecksSettingsUpdateReceipt>;
}
