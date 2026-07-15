// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(screen.getByText("live_observation_not_integrated")).toBeTruthy();
    expect(screen.getAllByText("operation_in_progress")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Refresh$/ })
      .some((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect((screen.getByRole("button", { name: /^Sync status$/ }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(port.getApplicationDetail).toHaveBeenCalledWith(
      "checkout-api",
      expect.any(AbortSignal),
    ));
    expect(screen.queryByText(/fake diff/i)).toBeNull();
  });
});
