import { beforeEach, describe, expect, it, vi } from "vitest";

import { listGitOpsOverview } from "./gitops-overview";

describe("GitOps overview endpoint", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("encodes canonical scope filters and rejects raw controller payloads", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(fixture()));

    await expect(listGitOpsOverview({
      clusters: ["cluster-b", "cluster-a", "cluster-a"],
      namespaces: ["cluster-a/argocd"],
      labels: { team: "platform" },
      providers: ["argo"],
      q: "storefront",
      limit: 100,
    })).resolves.toMatchObject({
      items: [{ authority: "controller", resource: { uid: "application-uid" } }],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/gitops/overview?clusters=cluster-a%2Ccluster-b&namespaces=cluster-a%2Fargocd&providers=argo&labels=team%3Dplatform&q=storefront&limit=100",
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      ...fixture(),
      items: [{ ...fixture().items[0], raw: { spec: {} } }],
    }));
    await expect(listGitOpsOverview()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function fixture() {
  const scope = {
    workspace_id: "workspace-a",
    cluster_id: "cluster-a",
    namespaces: ["argocd"],
    freshness: "live",
  };
  const resource = {
    api_group: "argoproj.io",
    version: "v1alpha1",
    kind: "Application",
    namespace: "argocd",
    name: "storefront",
    uid: "application-uid",
  };
  return {
    workspace_id: "workspace-a",
    scopes: [scope],
    items: [{
      id: "controller:cluster-a:application-uid",
      authority: "controller",
      provider: "argo",
      role: "controller",
      display_name: "storefront",
      application_ids: [],
      binding_id: null,
      scope,
      resource,
      environment: null,
      status: "Synced",
      health: "Healthy",
      revision: "abc123",
      observed_at: "2026-07-17T01:02:03Z",
      labels: { team: "platform" },
      capabilities: { scope, resource, revision: "17", actions: [] },
      partial_reason_codes: [],
    }],
    kind_counts: [{
      api_group: "argoproj.io",
      version: "v1alpha1",
      kind: "Application",
      provider: "argo",
      role: "controller",
      count: 1,
      completeness: "exact",
    }],
    coverage: {
      state: "complete",
      registered_count: 0,
      controller_count: 1,
      returned_count: 1,
      reason_codes: [],
    },
    observed_at: "2026-07-17T01:02:03Z",
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
