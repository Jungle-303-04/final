// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GitOpsResourceInsights, GitOpsResourceTree } from "../../features/gitops/gitOpsContract";
import { gitOpsPort, renderGitOps } from "./GitOpsPage.testSupport";

afterEach(() => cleanup());

describe("GitOpsResourceDetailPage", () => {
  it("loads the observed tree and confirms an exact selective sync request", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    port.getResourceTree = vi.fn().mockResolvedValue(treeFixture());
    port.getResourceInsights = vi.fn().mockResolvedValue(insightsFixture());
    port.executeResourceAction = vi.fn().mockResolvedValue({
      accepted: true,
      commandId: "command-1",
      eventId: "event-1",
      auditEventId: "event-1",
      correlationId: "correlation-1",
      status: "queued",
    });
    renderGitOps(
      "/gitops/resource?cluster=cluster-a&apiVersion=argoproj.io%2Fv1alpha1&kind=Application&namespace=argocd&name=storefront",
      port,
    );

    expect(await screen.findByRole("heading", { name: "storefront" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open storefront" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open storefront-source" }).getAttribute("href"))
      .toContain("/gitops/resource?cluster=cluster-a");
    await user.click(screen.getByRole("checkbox", { name: "Select checkout for selective sync" }));
    await user.click(screen.getByRole("button", { name: "Sync" }));
    await user.type(screen.getByLabelText("Reason"), "reviewed selective deployment sync");
    await user.type(screen.getByLabelText("Revision"), "main@sha1:abc");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(port.executeResourceAction).toHaveBeenCalledTimes(1));
    expect(port.executeResourceAction).toHaveBeenCalledWith(
      {
        clusterId: "cluster-a",
        apiVersion: "argoproj.io/v1alpha1",
        kind: "Application",
        namespace: "argocd",
        name: "storefront",
      },
      expect.objectContaining({
        action: "sync",
        confirmation: true,
        reason: "reviewed selective deployment sync",
        insights: insightsFixture(),
        options: {
          revision: "main@sha1:abc",
          prune: true,
          dryRun: false,
          force: false,
          applyOnly: false,
          syncOptions: [],
          resources: [{
            apiGroup: "apps",
            kind: "Deployment",
            namespace: "shop",
            name: "checkout",
          }],
        },
        idempotencyKey: expect.any(String),
      }),
    );
    expect(await screen.findByText("Controller action accepted · correlation-1")).toBeTruthy();
  });
});

function treeFixture(): GitOpsResourceTree {
  const root = resource("argoproj.io", "v1alpha1", "Application", "argocd", "storefront", "app-uid");
  const child = resource("apps", "v1", "Deployment", "shop", "checkout", "deployment-uid");
  const source = resource(
    "source.toolkit.fluxcd.io",
    "v1",
    "GitRepository",
    "argocd",
    "storefront-source",
    "source-uid",
  );
  return {
    scope: scope(),
    root,
    nodes: [
      { id: root.uid, resource: root, role: "root", status: "Synced", health: "Healthy" },
      { id: child.uid, resource: child, role: "declared", status: "Synced", health: "Healthy" },
      { id: source.uid, resource: source, role: "source", status: "Ready", health: null },
    ],
    edges: [
      { source: root.uid, target: child.uid, relationship: "owns" },
      { source: source.uid, target: root.uid, relationship: "source" },
    ],
    coverage: { state: "complete", reasonCodes: [], observedCount: 3, returnedCount: 3 },
  };
}

function insightsFixture(): GitOpsResourceInsights {
  const root = resource("argoproj.io", "v1alpha1", "Application", "argocd", "storefront", "app-uid");
  return {
    scope: scope(),
    resource: root,
    resourceVersion: "17",
    provider: "argo",
    status: "Synced",
    health: "Healthy",
    revision: "main@sha1:abc",
    source: null,
    conditions: [],
    history: [],
    capabilities: { scope: scope(), resource: root, revision: "sha256:capability", actions: ["refresh", "sync"] },
  };
}

function scope() {
  return {
    workspaceId: "workspace-a",
    clusterId: "cluster-a",
    namespaces: ["argocd"],
    freshness: "live" as const,
  };
}

function resource(
  apiGroup: string,
  version: string,
  kind: string,
  namespace: string,
  name: string,
  uid: string,
) {
  return { apiGroup, version, kind, namespace, name, uid };
}
