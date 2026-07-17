import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHECKS_OVERVIEW_PATH,
  CHECKS_SETTINGS_PATH,
  checksDetailPath,
  getChecksDetail,
  getChecksOverview,
  getChecksSettings,
  updateChecksSettings,
} from "./checks";

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

  it("accepts a count-consistent agent observation and rejects mismatched findings", async () => {
    const fixture = observedOverview();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(fixture));

    await expect(getChecksOverview()).resolves.toMatchObject({
      result_set: { availability: "available", total_finding_count: 1 },
      visibility: { clusters: [{ cluster_id: "cluster-a", state: "limited" }] },
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ...fixture,
      result_set: { ...fixture.result_set, total_finding_count: 0 },
    }));
    await expect(getChecksOverview()).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("reads and revision-writes strict server-backed settings with CSRF protection", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(settings()));

    await expect(getChecksSettings()).resolves.toMatchObject({ revision: 2, can_edit: true });
    expect(CHECKS_SETTINGS_PATH).toBe("/api/settings/audit");

    fetchMock.mockResolvedValueOnce(jsonResponse({
      ...settings(),
      revision: 3,
      invalidation_generation: 3,
      event_id: "event-3",
      audit_event_id: "event-3",
    }));
    await expect(updateChecksSettings({
      policy: settings().policy,
      expected_revision: 2,
    })).resolves.toMatchObject({ revision: 3, event_id: "event-3" });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/settings/audit");
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(new Headers(init.headers).get("x-service-csrf")).toBe("same-origin");

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...settings(), credential: "secret" }));
    await expect(getChecksSettings()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function settings() {
  return {
    workspace_id: "workspace-a",
    user_id: "user-a",
    policy: {
      hidden_check_ids: ["workload-limits"],
      hidden_categories: [],
      hidden_namespaces: ["cluster-a/storefront"],
    },
    revision: 2,
    invalidation_generation: 2,
    can_edit: true,
    updated_at: "2026-07-17T10:00:00Z",
  };
}

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
    visibility: {
      availability: "unavailable",
      clusters: [],
      reason_codes: ["checks_visibility_not_observed"],
    },
  };
}

function observedOverview() {
  return {
    scope_coverage: coverage(),
    result_set: {
      availability: "available",
      evaluated_at: "2026-07-17T05:59:30+00:00",
      checks: [finding()],
      total_check_count: 1,
      total_finding_count: 1,
      reason_codes: [],
    },
    catalog: {
      availability: "available",
      entries: [{
        check_id: "workload-limits",
        title: "Workload limits",
        category: "resources",
        severity: "warning",
        description: "Checks container resource limits.",
        remediation: "Set explicit resource limits.",
      }],
      reason_codes: [],
    },
    visibility: {
      availability: "available",
      clusters: [{
        cluster_id: "cluster-a",
        state: "limited",
        namespace_scope: ["storefront"],
        core: { deployments: "allowed" },
        missing_optional_kinds: ["Gateway"],
      }],
      reason_codes: [],
    },
  };
}

function finding() {
  return {
    finding_id: "finding-a",
    cluster_id: "cluster-a",
    check_id: "workload-limits",
    category: "resources",
    severity: "warning",
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
