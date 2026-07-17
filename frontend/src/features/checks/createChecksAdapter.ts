import {
  ChecksPortFailure,
  type ChecksDetailResponse,
  type ChecksFailureCode,
  type ChecksOverview,
  type ChecksPort,
  type ChecksScopeCoverage,
  type ChecksSettings,
  type ChecksSettingsUpdateReceipt,
} from "./checksContract";
import type {
  ChecksEndpointCatalog,
  ChecksEndpointCatalogEntry,
  ChecksEndpointDependencies,
  ChecksEndpointDetail,
  ChecksEndpointFinding,
  ChecksEndpointResultSet,
  ChecksEndpointScopeCoverage,
} from "./checksEndpointContract";
import {
  loadInjectedBrowserRefreshPolicy,
  type BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";

export function createChecksAdapter(
  endpoints: ChecksEndpointDependencies,
  refreshPolicies?: BrowserRefreshPolicyRegistry<"issues_audit">,
): ChecksPort {
  return {
    loadRefreshPolicy(signal) {
      return loadInjectedBrowserRefreshPolicy(refreshPolicies, "issues_audit", signal);
    },
    async getOverview(request, signal) {
      return withPortFailure(async () => toOverview(await endpoints.getChecksOverview(request, signal)));
    },
    async getDetail(checkId, request, signal) {
      return withPortFailure(async () => toDetail(await endpoints.getChecksDetail(checkId, request, signal)));
    },
    async getSettings(signal) {
      return withPortFailure(async () => toSettings(await endpoints.getChecksSettings(signal)));
    },
    async updateSettings(policy, expectedRevision, signal) {
      return withPortFailure(async () => toSettingsReceipt(await endpoints.updateChecksSettings({
        policy: {
          hidden_check_ids: [...policy.hiddenCheckIds],
          hidden_categories: [...policy.hiddenCategories],
          hidden_namespaces: [...policy.hiddenNamespaces],
        },
        expected_revision: expectedRevision,
      }, signal)));
    },
  };
}

function toSettings(value: Awaited<ReturnType<ChecksEndpointDependencies["getChecksSettings"]>>): ChecksSettings {
  return {
    workspaceId: value.workspace_id,
    userId: value.user_id,
    policy: {
      hiddenCheckIds: value.policy.hidden_check_ids,
      hiddenCategories: value.policy.hidden_categories,
      hiddenNamespaces: value.policy.hidden_namespaces,
    },
    revision: value.revision,
    invalidationGeneration: value.invalidation_generation,
    canEdit: value.can_edit,
    updatedAt: value.updated_at,
  };
}

function toSettingsReceipt(
  value: Awaited<ReturnType<ChecksEndpointDependencies["updateChecksSettings"]>>,
): ChecksSettingsUpdateReceipt {
  return {
    ...toSettings(value),
    eventId: value.event_id,
    auditEventId: value.audit_event_id,
  };
}

function toOverview(value: Awaited<ReturnType<ChecksEndpointDependencies["getChecksOverview"]>>): ChecksOverview {
  return {
    scopeCoverage: toScopeCoverage(value.scope_coverage),
    resultSet: toResultSet(value.result_set),
    catalog: toCatalog(value.catalog),
    visibility: {
      availability: value.visibility.availability,
      clusters: value.visibility.clusters.map((item) => ({
        clusterId: item.cluster_id,
        state: item.state,
        namespaceScope: item.namespace_scope,
        core: item.core,
        missingOptionalKinds: item.missing_optional_kinds,
      })),
      reasonCodes: value.visibility.reason_codes,
    },
  };
}

function toDetail(value: Awaited<ReturnType<ChecksEndpointDependencies["getChecksDetail"]>>): ChecksDetailResponse {
  return {
    scopeCoverage: toScopeCoverage(value.scope_coverage),
    detail: toDetailValue(value.detail),
  };
}

function toResultSet(value: ChecksEndpointResultSet): ChecksOverview["resultSet"] {
  if (value.availability === "unavailable") {
    return {
      availability: "unavailable",
      evaluatedAt: null,
      checks: null,
      totalCheckCount: null,
      totalFindingCount: null,
      reasonCodes: value.reason_codes,
    };
  }
  return {
    availability: value.availability,
    evaluatedAt: value.evaluated_at,
    checks: value.checks.map(toFinding),
    totalCheckCount: value.total_check_count,
    totalFindingCount: value.total_finding_count,
    reasonCodes: value.reason_codes,
  };
}

function toCatalog(value: ChecksEndpointCatalog): ChecksOverview["catalog"] {
  if (value.availability === "unavailable") {
    return { availability: "unavailable", entries: null, reasonCodes: value.reason_codes };
  }
  return {
    availability: value.availability,
    entries: value.entries.map(toCatalogEntry),
    reasonCodes: value.reason_codes,
  };
}

function toDetailValue(value: ChecksEndpointDetail): ChecksDetailResponse["detail"] {
  if (value.availability === "unavailable") {
    return {
      requestedCheckId: value.requested_check_id,
      availability: "unavailable",
      title: null,
      category: null,
      effectiveSeverity: null,
      message: null,
      remediation: null,
      affectedResourceCount: null,
      findings: null,
      reasonCodes: value.reason_codes,
    };
  }
  return {
    requestedCheckId: value.requested_check_id,
    availability: value.availability,
    title: value.title,
    category: value.category,
    effectiveSeverity: value.effective_severity,
    message: value.message,
    remediation: value.remediation,
    affectedResourceCount: value.affected_resource_count,
    findings: value.findings.map(toFinding),
    reasonCodes: value.reason_codes,
  };
}

function toFinding(value: ChecksEndpointFinding) {
  return {
    findingId: value.finding_id,
    clusterId: value.cluster_id,
    checkId: value.check_id,
    category: value.category,
    severity: value.severity,
    message: value.message,
    resource: {
      apiGroup: value.resource.api_group,
      version: value.resource.version,
      kind: value.resource.kind,
      namespace: value.resource.namespace,
      name: value.resource.name,
      uid: value.resource.uid,
    },
  };
}

function toCatalogEntry(value: ChecksEndpointCatalogEntry) {
  return {
    checkId: value.check_id,
    title: value.title,
    category: value.category,
    severity: value.severity,
    description: value.description,
    remediation: value.remediation,
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
  const status = typeof record?.status === "number" ? record.status : null;
  if (status === 409) return new ChecksPortFailure("conflict", retryAfter);
  return new ChecksPortFailure(kinds[kind] ?? "error", retryAfter);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
