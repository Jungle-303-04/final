import { describe, expect, it, vi } from "vitest";

import { createChecksAdapter } from "./createChecksAdapter";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";

describe("createChecksAdapter", () => {
  it("maps unavailable result and catalog evidence without substituting a clean result", async () => {
    const port = createChecksAdapter({
      getChecksOverview: vi.fn().mockResolvedValue(overview()),
      getChecksDetail: vi.fn().mockResolvedValue(detail()),
    }, refreshPolicies());

    const response = await port.getOverview({ clusterIds: ["cluster-a"], namespaces: [] });
    const direct = await port.getDetail("workload-limits", { clusterIds: ["cluster-a"], namespaces: [] });

    expect(response.resultSet).toMatchObject({ checks: null, totalCheckCount: null, totalFindingCount: null });
    expect(response.catalog.entries).toBeNull();
    expect(direct.detail).toMatchObject({ requestedCheckId: "workload-limits", title: null, findings: null });
    await expect(port.loadRefreshPolicy()).resolves.toMatchObject({ refreshAfterSeconds: 60 });
  });

  it("maps observed findings, catalog entries, and visibility without losing resource identity", async () => {
    const port = createChecksAdapter({
      getChecksOverview: vi.fn().mockResolvedValue(observedOverview()),
      getChecksDetail: vi.fn().mockResolvedValue(observedDetail()),
    }, refreshPolicies());

    const response = await port.getOverview({ clusterIds: ["cluster-a"], namespaces: ["cluster-a/storefront"] });
    const direct = await port.getDetail("workload-limits", { clusterIds: ["cluster-a"], namespaces: [] });

    expect(response.resultSet).toMatchObject({
      availability: "available",
      totalFindingCount: 1,
      checks: [{ clusterId: "cluster-a", resource: { namespace: "storefront", uid: "uid-checkout" } }],
    });
    expect(response.catalog).toMatchObject({ entries: [{ checkId: "workload-limits" }] });
    expect(response.visibility.clusters[0]).toMatchObject({ clusterId: "cluster-a", state: "limited" });
    expect(direct.detail).toMatchObject({ title: "Workload limits", affectedResourceCount: 1 });
  });
});

function overview() {
  return {
    scope_coverage: coverage(),
    result_set: {
      availability: "unavailable" as const,
      evaluated_at: null,
      checks: null,
      total_check_count: null,
      total_finding_count: null,
      reason_codes: ["checks_result_projection_not_integrated"],
    },
    catalog: { availability: "unavailable" as const, entries: null, reason_codes: ["checks_catalog_not_integrated"] },
    visibility: { availability: "unavailable" as const, clusters: [], reason_codes: ["checks_visibility_not_observed"] },
  };
}

function observedOverview() {
  return {
    scope_coverage: coverage(),
    result_set: {
      availability: "available" as const,
      evaluated_at: "2026-07-17T05:59:30+00:00",
      checks: [wireFinding()],
      total_check_count: 1,
      total_finding_count: 1,
      reason_codes: [],
    },
    catalog: {
      availability: "available" as const,
      entries: [wireCatalogEntry()],
      reason_codes: [],
    },
    visibility: {
      availability: "available" as const,
      clusters: [{
        cluster_id: "cluster-a",
        state: "limited" as const,
        namespace_scope: ["storefront"],
        core: { deployments: "allowed" as const },
        missing_optional_kinds: ["Gateway"],
      }],
      reason_codes: [],
    },
  };
}

function observedDetail() {
  return {
    scope_coverage: coverage(),
    detail: {
      requested_check_id: "workload-limits",
      availability: "available" as const,
      title: "Workload limits",
      category: "resources",
      effective_severity: "warning" as const,
      message: "Container limits are not observed.",
      remediation: "Set explicit resource limits.",
      affected_resource_count: 1,
      findings: [wireFinding()],
      reason_codes: [],
    },
  };
}

function wireFinding() {
  return {
    finding_id: "finding-a",
    cluster_id: "cluster-a",
    check_id: "workload-limits",
    category: "resources",
    severity: "warning" as const,
    message: "Container limits are not observed.",
    resource: {
      api_group: "apps",
      version: "v1",
      kind: "Deployment",
      namespace: "storefront",
      name: "checkout",
      uid: "uid-checkout",
    },
  };
}

function wireCatalogEntry() {
  return {
    check_id: "workload-limits",
    title: "Workload limits",
    category: "resources",
    severity: "warning" as const,
    description: "Checks container resource limits.",
    remediation: "Set explicit resource limits.",
  };
}

function refreshPolicies(): BrowserRefreshPolicyRegistry<"issues_audit"> {
  return {
    getPolicy: vi.fn().mockResolvedValue({
      staleAfterSeconds: 30,
      refreshAfterSeconds: 60,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    }),
  };
}

function detail() {
  return {
    scope_coverage: coverage(),
    detail: {
      requested_check_id: "workload-limits",
      availability: "unavailable" as const,
      title: null,
      category: null,
      effective_severity: null,
      message: null,
      remediation: null,
      affected_resource_count: null,
      findings: null,
      reason_codes: ["checks_catalog_not_integrated", "checks_result_projection_not_integrated"],
    },
  };
}

function coverage() {
  return {
    availability: "available" as const,
    scopes: [{ workspace_id: "workspace-a", cluster_id: "cluster-a", namespaces: [], freshness: "live" as const }],
    observed_at: "2026-07-16T09:00:00Z",
    reason_codes: [],
  };
}
