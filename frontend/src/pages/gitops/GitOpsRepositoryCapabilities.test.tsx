// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import type { RcaContextPort } from "../../features/issues/rcaContextContract";
import { GitOpsPortFailure, type GitOpsPort } from "../../features/gitops/gitOpsContract";
import { I18nProvider } from "../../shared/i18n";
import { GitOpsSyncTableView } from "./GitOpsSyncTableView";
import { gitOpsPort, gitOpsRefreshPolicies } from "./GitOpsPage.testSupport";

afterEach(cleanup);

describe("GitOps repository capability workspace", () => {
  it("keeps application evidence, resource RCA, selective sync, and command execution in the repository flow", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    const scope = {
      clusterId: "production-cluster",
      freshness: "live" as const,
      namespaces: ["checkout"],
      workspaceId: "jungle-303",
    };
    vi.mocked(port.getApplicationDetail).mockResolvedValue({
      applicationId: "checkout-api",
      capabilities: [{
        action: "refresh", authorization: "allowed", availability: "available",
        enabled: false, operationBlocked: false, reasonCode: null,
      }, {
        action: "sync", authorization: "allowed", availability: "available",
        enabled: false, operationBlocked: false, reasonCode: null,
      }],
      desiredLiveDiff: {
        availability: "available", liveObservationRevision: "live-123",
        reasonCode: null, sourceRevision: "source-456",
      },
      name: "Checkout API",
      operation: {
        availability: "available", inProgress: false, observedAt: "2026-07-20T01:02:03Z",
        reasonCode: null, status: "succeeded", workflowRunId: "run-42",
      },
      resource: {
        apiGroup: "argoproj.io", kind: "Application", name: "checkout-api",
        namespace: "checkout", uid: "application-checkout", version: "v1alpha1",
      },
      scope: { availability: "available", reasonCode: null, scope },
      source: {
        defaultBranch: "main", manifestPath: "deploy/checkout.yaml",
        repositoryRef: "team/checkout-api",
      },
    });
    port.getResourceTree = vi.fn<NonNullable<GitOpsPort["getResourceTree"]>>().mockResolvedValue({
      coverage: { observedCount: 2, reasonCodes: [], returnedCount: 2, state: "complete" },
      edges: [{ relationship: "owns", source: "application", target: "deployment" }],
      nodes: [{
        health: "Healthy", id: "application", role: "root", status: "Synced",
        resource: {
          apiGroup: "argoproj.io", kind: "Application", name: "checkout-api",
          namespace: "checkout", uid: "application-checkout", version: "v1alpha1",
        },
      }, {
        health: "Healthy", id: "deployment", role: "generated", status: "Synced",
        resource: {
          apiGroup: "apps", kind: "Deployment", name: "checkout-deployment",
          namespace: "checkout", uid: "deployment-checkout", version: "v1",
        },
      }],
      root: {
        apiGroup: "argoproj.io", kind: "Application", name: "checkout-api",
        namespace: "checkout", uid: "application-checkout", version: "v1alpha1",
      },
      scope,
    });
    port.getResourceInsights = vi.fn<NonNullable<GitOpsPort["getResourceInsights"]>>().mockResolvedValue({
      capabilities: {
        actions: ["sync", "refresh"],
        resource: {
          apiGroup: "argoproj.io", kind: "Application", name: "checkout-api",
          namespace: "checkout", uid: "application-checkout", version: "v1alpha1",
        },
        revision: "capability-7", scope,
      },
      conditions: [{
        message: "Applied", observedAt: "2026-07-20T01:02:03Z",
        reason: "Reconciled", status: "True", type: "Ready",
      }],
      health: "Healthy",
      history: [{
        deployedAt: "2026-07-20T01:02:03Z", id: "history-1", initiatedBy: "operator",
        message: "Applied", phase: "Succeeded", revision: "source-456",
      }],
      provider: "argo", resource: {
        apiGroup: "argoproj.io", kind: "Application", name: "checkout-api",
        namespace: "checkout", uid: "application-checkout", version: "v1alpha1",
      },
      resourceVersion: "resource-9", revision: "source-456", scope,
      source: null, status: "Synced",
    });
    port.executeResourceAction = vi.fn<NonNullable<GitOpsPort["executeResourceAction"]>>().mockResolvedValue({
      accepted: true, auditEventId: "audit-1", commandId: "command-1",
      correlationId: "correlation-1", eventId: "event-1", status: "queued",
    });
    const rcaContextPort: RcaContextPort = {
      load: vi.fn<RcaContextPort["load"]>().mockResolvedValue({
        coverageAvailability: "available", reasonCodes: [], record: null,
        scope, state: "empty",
      }),
    };

    render(
      <MemoryRouter>
        <I18nProvider navigatorLanguage="en-US" storage={null}>
          <GitOpsSyncTableView
            port={port}
            rcaContextPort={rcaContextPort}
            refreshPolicies={gitOpsRefreshPolicies()}
          />
        </I18nProvider>
      </MemoryRouter>,
    );

    const repository = await screen.findByRole("row", { name: /team\/checkout-api/u });
    await user.click(within(repository).getByRole("button", { name: "Details: team/checkout-api" }));
    await user.click(screen.getByRole("button", { name: "Details: Checkout API" }));

    expect((await screen.findAllByText("source-456")).length).toBeGreaterThan(0);
    expect(screen.getByText("live-123")).toBeTruthy();
    await waitFor(() => expect(port.getResourceTree).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "Application", name: "checkout-api" }),
      expect.any(AbortSignal),
    ));
    await waitFor(() => expect(port.getResourceInsights).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "Application", name: "checkout-api" }),
      expect.any(AbortSignal),
    ));
    const deploymentSelection = await screen.findByRole("checkbox", {
      name: "Select checkout-deployment for selective sync",
    });
    expect(await screen.findByText("Reconciled · Applied · 2026-07-20T01:02:03Z")).toBeTruthy();
    await waitFor(() => expect(rcaContextPort.load).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "resource" }), expect.any(AbortSignal),
    ));

    await user.click(deploymentSelection);
    await user.click(screen.getByRole("button", { name: "Sync" }));
    await user.type(screen.getByLabelText("Reason"), "align desired state");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(port.executeResourceAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "Application", name: "checkout-api" }),
      expect.objectContaining({
        action: "sync",
        options: expect.objectContaining({
          resources: [expect.objectContaining({ kind: "Deployment", name: "checkout-deployment" })],
        }),
        reason: "align desired state",
      }),
    ));
    expect(await screen.findByText("Controller action accepted · correlation-1")).toBeTruthy();
  });

  it("keeps an application detail failure actionable without leaving the repository", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    vi.mocked(port.getApplicationDetail).mockRejectedValue(new GitOpsPortFailure("offline"));
    render(
      <MemoryRouter>
        <I18nProvider navigatorLanguage="en-US" storage={null}>
          <GitOpsSyncTableView port={port} refreshPolicies={gitOpsRefreshPolicies()} />
        </I18nProvider>
      </MemoryRouter>,
    );

    const repository = await screen.findByRole("row", { name: /team\/checkout-api/u });
    await user.click(within(repository).getByRole("button", { name: "Details: team/checkout-api" }));
    await user.click(screen.getByRole("button", { name: "Details: Checkout API" }));

    expect(await screen.findByRole("heading", { name: "Unable to reach the control plane" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(port.getApplicationDetail).toHaveBeenCalledTimes(2));
  });
});
