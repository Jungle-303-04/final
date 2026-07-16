// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GitOpsPortFailure } from "../../features/gitops/gitOpsContract";
import { gitOpsPort, renderGitOps } from "./GitOpsPage.testSupport";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GitOpsApplicationDetailPage", () => {
  it("renders unavailable desired/live evidence and gates sync while an operation is observed", async () => {
    const port = gitOpsPort();
    vi.mocked(port.getApplicationDetail).mockResolvedValue({
      applicationId: "checkout-api",
      name: "Checkout API",
      resource: {
        apiGroup: "opsia.io",
        version: "v1",
        kind: "GitOpsApplication",
        namespace: "checkout",
        name: "Checkout API",
        uid: "checkout-api",
      },
      scope: {
        availability: "available",
        scope: {
          workspaceId: "workspace-a",
          clusterId: "cluster-a",
          namespaces: ["checkout"],
          freshness: "partial",
        },
        reasonCode: null,
      },
      source: {
        repositoryRef: "opsia/checkout",
        defaultBranch: "main",
        manifestPath: "deploy/production",
      },
      desiredLiveDiff: {
        availability: "unavailable",
        sourceRevision: "abc123",
        liveObservationRevision: null,
        reasonCode: "live_observation_not_integrated",
      },
      operation: {
        availability: "partial",
        inProgress: true,
        workflowRunId: "run-1",
        status: "applying",
        observedAt: "2026-07-16T09:00:00Z",
        reasonCode: "provider_operation_not_integrated",
      },
      capabilities: [{
        action: "refresh",
        authorization: "allowed",
        availability: "unavailable",
        enabled: false,
        operationBlocked: false,
        reasonCode: "provider_refresh_not_integrated",
      }, {
        action: "sync",
        authorization: "allowed",
        availability: "unavailable",
        enabled: false,
        operationBlocked: true,
        reasonCode: "operation_in_progress",
      }],
    });

    renderGitOps("/gitops/detail/checkout-api", port);

    expect(await screen.findByRole("heading", { name: "Checkout API" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Desired / live comparison" })).toBeTruthy();
    expect(screen.getByText("Live observation is not integrated.")).toBeTruthy();
    expect(screen.getByText("Provider integration unavailable · Live observation is not integrated.")).toBeTruthy();
    expect(screen.getByText("Another operation is in progress.")).toBeTruthy();
    expect(screen.getByText("Operation in progress · Another operation is in progress.")).toBeTruthy();
    expect(screen.queryByText("{action} in progress")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Refresh$/ })
      .some((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect((screen.getByRole("button", { name: /^Sync$/ }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(port.getApplicationDetail).toHaveBeenCalledWith(
      "checkout-api",
      expect.any(AbortSignal),
    ));
    expect(screen.queryByText(/fake diff/i)).toBeNull();
    expect(screen.queryByText("live_observation_not_integrated")).toBeNull();
  });

  it("resolves literal and encoded slash-containing application IDs to the detail contract", async () => {
    const port = gitOpsPort();
    renderGitOps("/gitops/detail/application/default/storefront", port);

    await screen.findByRole("heading", { name: "Checkout API" });
    await waitFor(() => expect(port.getApplicationDetail).toHaveBeenCalledWith(
      "application/default/storefront",
      expect.any(AbortSignal),
    ));
    cleanup();

    renderGitOps("/gitops/detail/application%2Fdefault%2Fstorefront", port);
    await screen.findByRole("heading", { name: "Checkout API" });
    await waitFor(() => expect(port.getApplicationDetail).toHaveBeenLastCalledWith(
      "application/default/storefront",
      expect.any(AbortSignal),
    ));
  });

  it("distinguishes forbidden, missing, and offline detail requests", async () => {
    const forbidden = gitOpsPort();
    vi.mocked(forbidden.getApplicationDetail).mockRejectedValue(new GitOpsPortFailure("forbidden"));
    renderGitOps("/gitops/detail/checkout-api", forbidden);
    expect(await screen.findByRole("heading", { name: "You cannot access this scope" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    cleanup();

    const missing = gitOpsPort();
    vi.mocked(missing.getApplicationDetail).mockRejectedValue(new GitOpsPortFailure("not-found"));
    renderGitOps("/gitops/detail/checkout-api", missing);
    expect(await screen.findByRole("heading", { name: "We couldn't find that item" })).toBeTruthy();
    cleanup();

    const offline = gitOpsPort();
    vi.mocked(offline.getApplicationDetail).mockRejectedValue(new GitOpsPortFailure("offline"));
    renderGitOps("/gitops/detail/checkout-api", offline);
    expect(await screen.findByRole("heading", { name: "Unable to reach the control plane" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
