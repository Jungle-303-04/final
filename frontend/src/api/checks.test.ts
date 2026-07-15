import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKS_OVERVIEW_PATH, checksDetailPath, getChecksDetail, getChecksOverview } from "./checks";

describe("Checks API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes scope and direct detail URL without converting unavailable findings to an empty array", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(overview()));

    await expect(getChecksOverview({
      clusterIds: ["cluster-b", "cluster-a", "cluster-a"],
      namespaces: ["cluster-a/storefront"],
    })).resolves.toMatchObject({ result_set: { checks: null, total_finding_count: null } });
    expect(CHECKS_OVERVIEW_PATH).toBe("/api/checks/overview");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/checks/overview?clusters=cluster-a%2Ccluster-b&namespaces=cluster-a%2Fstorefront",
    );

    fetchMock.mockResolvedValueOnce(jsonResponse(detail("workload-limits")));
    await expect(getChecksDetail("workload-limits", { clusterIds: ["cluster-a"] })).resolves.toMatchObject({
      detail: { requested_check_id: "workload-limits", findings: null },
    });
    expect(checksDetailPath("workload-limits")).toBe("/api/checks/workload-limits");
  });

  it("fails closed if an unavailable result is represented as a zero count", async () => {
    const fixture = overview();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture,
      result_set: { ...fixture.result_set, total_finding_count: 0 },
    }));

    await expect(getChecksOverview()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function overview() {
  return {
    scope_coverage: coverage(),
    result_set: {
      availability: "unavailable",
      evaluated_at: null,
      checks: null,
      total_check_count: null,
      total_finding_count: null,
      reason_codes: ["checks_result_projection_not_integrated"],
    },
    catalog: {
      availability: "unavailable",
      entries: null,
      reason_codes: ["checks_catalog_not_integrated"],
    },
  };
}

function detail(checkId: string) {
  return {
    scope_coverage: coverage(),
    detail: {
      requested_check_id: checkId,
      availability: "unavailable",
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
    availability: "available",
    scopes: [{
      workspace_id: "workspace-a",
      cluster_id: "cluster-a",
      namespaces: ["storefront"],
      freshness: "live",
    }],
    observed_at: "2026-07-16T09:00:00Z",
    reason_codes: [],
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
