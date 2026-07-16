import { describe, expect, it, vi } from "vitest";

import { createChecksAdapter } from "./createChecksAdapter";

describe("createChecksAdapter", () => {
  it("maps unavailable result and catalog evidence without substituting a clean result", async () => {
    const port = createChecksAdapter({
      getChecksOverview: vi.fn().mockResolvedValue(overview()),
      getChecksDetail: vi.fn().mockResolvedValue(detail()),
    });

    const response = await port.getOverview({ clusterIds: ["cluster-a"], namespaces: [] });
    const direct = await port.getDetail("workload-limits", { clusterIds: ["cluster-a"], namespaces: [] });

    expect(response.resultSet).toMatchObject({ checks: null, totalCheckCount: null, totalFindingCount: null });
    expect(response.catalog.entries).toBeNull();
    expect(direct.detail).toMatchObject({ requestedCheckId: "workload-limits", title: null, findings: null });
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
