import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeGitOpsResourceAction, getGitOpsResourceTree } from "./gitops-resource-detail";

const locator = {
  clusterId: "cluster-a",
  apiVersion: "argoproj.io/v1alpha1",
  kind: "Application",
  namespace: "argocd",
  name: "storefront",
};

describe("GitOps resource endpoints", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("encodes the exact CR identity and validates bounded tree coverage", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(treeFixture()));

    await expect(getGitOpsResourceTree(locator)).resolves.toMatchObject({
      root: { uid: "app-uid" },
      coverage: { state: "complete", returned_count: 1 },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/gitops/resources/Application/argocd/storefront/tree?cluster_id=cluster-a&api_version=argoproj.io%2Fv1alpha1",
    );
  });

  it("sends sync options and idempotency through the canonical action endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      accepted: true,
      event_id: "event-1",
      audit_event_id: "event-1",
      correlation_id: "correlation-1",
      command_id: "command-1",
      status: "queued",
    }));

    await executeGitOpsResourceAction(locator, {
      cluster_id: "cluster-a",
      resource: treeFixture().root,
      resource_version: "17",
      capability_revision: "sha256:capability",
      action: "sync",
      confirmation: true,
      reason: "apply reviewed change",
      options: {
        prune: false,
        dry_run: true,
        force: true,
        apply_only: false,
        sync_options: ["CreateNamespace=true"],
        resources: [],
      },
    }, "sync-storefront-17");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("sync-storefront-17");
    expect(JSON.parse(String(init.body))).toMatchObject({
      action: "sync",
      options: { dry_run: true, force: true, prune: false },
    });
  });
});

function treeFixture() {
  const root = {
    api_group: "argoproj.io",
    version: "v1alpha1",
    kind: "Application",
    namespace: "argocd",
    name: "storefront",
    uid: "app-uid",
  };
  return {
    scope: {
      workspace_id: "workspace-a",
      cluster_id: "cluster-a",
      namespaces: ["argocd"],
      freshness: "live",
    },
    root,
    nodes: [{ id: "app-uid", resource: root, role: "root", status: "Synced", health: "Healthy" }],
    edges: [],
    coverage: { state: "complete", reason_codes: [], observed_count: 1, returned_count: 1 },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
