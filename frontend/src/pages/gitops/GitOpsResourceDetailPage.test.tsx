// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GitOpsResourceInsights, GitOpsResourceTree } from "../../features/gitops/gitOpsContract";
import { GitOpsPortFailure } from "../../features/gitops/gitOpsContract";
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

  it("connects exact GitOps resource scope to the shared RCA context", async () => {
    const port = gitOpsPort();
    port.getResourceTree = vi.fn().mockResolvedValue(treeFixture());
    port.getResourceInsights = vi.fn().mockResolvedValue(insightsFixture());
    const load = vi.fn().mockResolvedValue({
      state: "available",
      scope: scope(),
      coverageAvailability: "available",
      reasonCodes: [],
      record: {
        issue: issueFixture(),
        report: null,
        rootCause: "controller reconciliation failed",
        impact: "deployment remained out of sync",
        evidence: ["controller condition"],
        missingEvidence: [],
      },
    });
    renderGitOps(
      "/gitops/resource?cluster=cluster-a&apiVersion=argoproj.io%2Fv1alpha1&kind=Application&namespace=argocd&name=storefront",
      port,
      { load },
    );

    expect(await screen.findByText("deployment remained out of sync")).toBeTruthy();
    expect(load).toHaveBeenCalledWith(expect.objectContaining({
      kind: "resource",
      scope: scope(),
      resource: insightsFixture().resource,
    }), expect.any(AbortSignal));
  });

  it("keeps validated insights visible when the resource tree is forbidden", async () => {
    const port = gitOpsPort();
    port.getResourceTree = vi.fn().mockRejectedValue(new GitOpsPortFailure("forbidden"));
    port.getResourceInsights = vi.fn().mockResolvedValue(insightsFixture());

    renderGitOps(
      "/gitops/resource?cluster=cluster-a&apiVersion=argoproj.io%2Fv1alpha1&kind=Application&namespace=argocd&name=storefront",
      port,
    );

    expect(await screen.findByRole("heading", { name: "storefront" })).toBeTruthy();
    expect(screen.getByText("Synced")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "You cannot access this scope" })).toBeTruthy();
  });

  it("shows the server retry window for a rate-limited exact resource", async () => {
    const port = gitOpsPort();
    port.getResourceTree = vi.fn().mockRejectedValue(new GitOpsPortFailure("rate-limited", 9));
    port.getResourceInsights = vi.fn().mockRejectedValue(new GitOpsPortFailure("rate-limited", 9));

    renderGitOps(
      "/gitops/resource?cluster=cluster-a&apiVersion=argoproj.io%2Fv1alpha1&kind=Application&namespace=argocd&name=storefront",
      port,
    );

    expect(await screen.findByText("Too many requests. Retry after 9 seconds.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

function issueFixture() {
  return {
    id: "workspace-a:correlation-a",
    incidentId: "incident-a",
    correlationId: "correlation-a",
    workspaceId: "workspace-a",
    clusterId: "cluster-a",
    namespace: "argocd",
    resourceKind: "Application",
    resourceName: "storefront",
    symptom: "out of sync",
    currentSubject: "rca.completed",
    status: "rca_completed",
    rootCause: "controller reconciliation failed",
    confidence: 0.9,
    supportingEvidence: ["controller condition"],
    missingEvidence: [],
    evidenceRef: "evidence://gitops",
    actionRoute: null,
    commandId: null,
    pullRequestUrl: null,
    errorReason: null,
    updatedAt: "2026-07-18T01:00:00Z",
  };
}

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
