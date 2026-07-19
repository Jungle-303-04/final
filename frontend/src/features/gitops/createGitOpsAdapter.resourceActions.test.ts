import { describe, expect, it, vi } from "vitest";

import { createGitOpsAdapter } from "./createGitOpsAdapter";
import {
  endpointFixture,
  resourceInsightsFixture,
} from "./createGitOpsAdapter.testSupport";

describe("createGitOpsAdapter resource actions", () => {
  it("maps exact provider insights and dispatches a revision-bound action receipt", async () => {
    const insights = resourceInsightsFixture();
    const endpoints = endpointFixture({
      getResourceInsights: vi.fn().mockResolvedValue({ insights }),
      executeResourceAction: vi.fn().mockResolvedValue({
        accepted: true,
        event_id: "event-1",
        audit_event_id: "event-1",
        correlation_id: "correlation-1",
        command_id: "command-1",
        status: "queued",
      }),
    });
    const port = createGitOpsAdapter(endpoints);
    const locator = {
      clusterId: "cluster-a",
      apiVersion: "argoproj.io/v1alpha1",
      kind: "Application",
      namespace: "argocd",
      name: "storefront",
    };
    const mapped = await port.getResourceInsights?.(locator);

    expect(mapped?.capabilities.actions).toEqual(["refresh", "sync"]);
    await expect(port.executeResourceAction?.(locator, {
      action: "refresh",
      confirmation: true,
      idempotencyKey: "refresh-storefront-17",
      insights: mapped!,
      reason: "refresh reviewed state",
      refreshMode: "hard",
    })).resolves.toMatchObject({ commandId: "command-1", auditEventId: "event-1" });
    expect(endpoints.executeResourceAction).toHaveBeenCalledWith(locator, expect.objectContaining({
      cluster_id: "cluster-a",
      resource_version: "17",
      capability_revision: "sha256:capability",
      action: "refresh",
      refresh_mode: "hard",
    }), "refresh-storefront-17", undefined);
  });
});
