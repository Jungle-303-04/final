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

export interface ChecksUnavailableCatalog {
  availability: "unavailable";
  entries: null;
  reasonCodes: readonly string[];
}

export interface ChecksOverview {
  scopeCoverage: ChecksScopeCoverage;
  resultSet: ChecksUnavailableResultSet;
  catalog: ChecksUnavailableCatalog;
}

export interface ChecksDetail {
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

export interface ChecksDetailResponse {
  scopeCoverage: ChecksScopeCoverage;
  detail: ChecksDetail;
}

export interface ChecksRequest {
  clusterIds: readonly string[];
  namespaces: readonly string[];
}

export type ChecksFailureCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-request"
  | "invalid-response"
  | "not-found"
  | "offline"
  | "rate-limited"
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
  getOverview(request: ChecksRequest, signal?: AbortSignal): Promise<ChecksOverview>;
  getDetail(checkId: string, request: ChecksRequest, signal?: AbortSignal): Promise<ChecksDetailResponse>;
}
