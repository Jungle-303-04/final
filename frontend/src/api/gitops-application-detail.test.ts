import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getGitOpsApplicationDetail,
  GITOPS_APPLICATION_DETAIL_PATH,
} from "./gitops-application-detail";

describe("getGitOpsApplicationDetail", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses the provider-neutral detail path and rejects browser-invented diffs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ application: detail() }));

    await expect(getGitOpsApplicationDetail("app/storefront")).resolves.toMatchObject({
      application: {
        application_id: "app-storefront",
        desired_live_diff: {
          availability: "unavailable",
          source_revision: "abc123",
          live_observation_revision: null,
        },
      },
    });
    expect(GITOPS_APPLICATION_DETAIL_PATH).toBe("/api/gitops/applications/{application_id}");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/gitops/applications/app%2Fstorefront");
  });

  it("fails closed when an unavailable comparison claims a diff body", async () => {
    const fixture = detail();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      application: { ...fixture, desired_live_diff: { ...fixture.desired_live_diff, diff: "fake" } },
    }));

    await expect(getGitOpsApplicationDetail("app-storefront")).rejects.toMatchObject({
      kind: "invalid-payload",
    });
  });
});

function detail() {
  return {
    application_id: "app-storefront",
    name: "storefront",
    resource: {
      api_group: "opsia.io",
      version: "v1",
      kind: "GitOpsApplication",
      namespace: "storefront",
      name: "storefront",
      uid: "app-storefront",
    },
    scope: {
      availability: "available",
      scope: {
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: ["storefront"],
        freshness: "partial",
      },
      reason_code: null,
    },
    source: {
      repository_ref: "opsia/storefront",
      default_branch: "main",
      manifest_path: "deploy/production",
    },
    desired_live_diff: {
      availability: "unavailable",
      source_revision: "abc123",
      live_observation_revision: null,
      reason_code: "live_observation_not_integrated",
    },
    operation: {
      availability: "partial",
      in_progress: true,
      workflow_run_id: "run-1",
      status: "applying",
      observed_at: "2026-07-16T09:00:00Z",
      reason_code: "provider_operation_not_integrated",
    },
    capabilities: [{
      action: "refresh",
      authorization: "allowed",
      availability: "unavailable",
      enabled: false,
      operation_blocked: false,
      reason_code: "provider_refresh_not_integrated",
    }, {
      action: "sync",
      authorization: "allowed",
      availability: "unavailable",
      enabled: false,
      operation_blocked: true,
      reason_code: "operation_in_progress",
    }],
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
