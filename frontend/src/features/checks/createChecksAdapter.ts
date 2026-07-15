import {
  ChecksPortFailure,
  type ChecksDetailResponse,
  type ChecksFailureCode,
  type ChecksOverview,
  type ChecksPort,
  type ChecksScopeCoverage,
} from "./checksContract";
import type { ChecksEndpointDependencies, ChecksEndpointScopeCoverage } from "./checksEndpointContract";

export function createChecksAdapter(endpoints: ChecksEndpointDependencies): ChecksPort {
  return {
    async getOverview(request, signal) {
      return withPortFailure(async () => toOverview(await endpoints.getChecksOverview(request, signal)));
    },
    async getDetail(checkId, request, signal) {
      return withPortFailure(async () => toDetail(await endpoints.getChecksDetail(checkId, request, signal)));
    },
  };
}

function toOverview(value: Awaited<ReturnType<ChecksEndpointDependencies["getChecksOverview"]>>): ChecksOverview {
  return {
    scopeCoverage: toScopeCoverage(value.scope_coverage),
    resultSet: {
      availability: value.result_set.availability,
      evaluatedAt: value.result_set.evaluated_at,
      checks: value.result_set.checks,
      totalCheckCount: value.result_set.total_check_count,
      totalFindingCount: value.result_set.total_finding_count,
      reasonCodes: value.result_set.reason_codes,
    },
    catalog: {
      availability: value.catalog.availability,
      entries: value.catalog.entries,
      reasonCodes: value.catalog.reason_codes,
    },
  };
}

function toDetail(value: Awaited<ReturnType<ChecksEndpointDependencies["getChecksDetail"]>>): ChecksDetailResponse {
  return {
    scopeCoverage: toScopeCoverage(value.scope_coverage),
    detail: {
      requestedCheckId: value.detail.requested_check_id,
      availability: value.detail.availability,
      title: value.detail.title,
      category: value.detail.category,
      effectiveSeverity: value.detail.effective_severity,
      message: value.detail.message,
      remediation: value.detail.remediation,
      affectedResourceCount: value.detail.affected_resource_count,
      findings: value.detail.findings,
      reasonCodes: value.detail.reason_codes,
    },
  };
}

function toScopeCoverage(value: ChecksEndpointScopeCoverage): ChecksScopeCoverage {
  return {
    availability: value.availability,
    scopes: value.scopes.map((scope) => ({
      workspaceId: scope.workspace_id,
      clusterId: scope.cluster_id,
      namespaces: scope.namespaces,
      freshness: scope.freshness,
    })),
    observedAt: value.observed_at,
    reasonCodes: value.reason_codes,
  };
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof ChecksPortFailure) throw error;
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): ChecksPortFailure {
  const kinds: Record<string, ChecksFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "invalid-request": "invalid-request",
    "invalid-payload": "invalid-response",
    "not-found": "not-found",
    network: "offline",
    "rate-limited": "rate-limited",
  };
  const record = typeof error === "object" && error !== null && !Array.isArray(error)
    ? error as Record<string, unknown>
    : null;
  const kind = typeof record?.kind === "string" ? record.kind : "";
  const retryAfter = typeof record?.retryAfter === "number" ? record.retryAfter : null;
  return new ChecksPortFailure(kinds[kind] ?? "error", retryAfter);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
