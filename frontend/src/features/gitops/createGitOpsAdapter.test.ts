import { describe, expect, it, vi } from "vitest";
import { GitOpsPortFailure } from "./gitOpsContract";
import type { GitOpsEndpointDependencies } from "./gitOpsEndpointContract";
import { createGitOpsAdapter } from "./createGitOpsAdapter";

describe("createGitOpsAdapter", () => {
  it("normalizes application records and drops entries without an id", async () => {
    const endpoints = endpointFixture({
      listApplications: vi.fn().mockResolvedValue({ applications: [{
        application_id: "checkout-api",
        name: "Checkout API",
        repo_ref: "team/checkout-api",
        branch: "main",
        cluster_id: "prod-east",
        manifest_path: "deploy/checkout.yaml",
      }, {
        name: "Missing identity",
      }] }),
    });

    await expect(createGitOpsAdapter(endpoints).listApplications()).resolves.toEqual([{
      id: "checkout-api",
      name: "Checkout API",
      repository: "team/checkout-api",
      branch: "main",
      clusterId: "prod-east",
      manifestPath: "deploy/checkout.yaml",
    }]);
  });

  it("maps invalid API payloads to the stable port failure contract", async () => {
    const endpoints = endpointFixture({
      listPlans: vi.fn().mockRejectedValue({ kind: "invalid-payload" }),
    });

    const request = createGitOpsAdapter(endpoints).listPlans();

    await expect(request).rejects.toBeInstanceOf(GitOpsPortFailure);
    await expect(request).rejects.toMatchObject({ code: "invalid-response" });
  });
});

function endpointFixture(
  overrides: Partial<GitOpsEndpointDependencies> = {},
): GitOpsEndpointDependencies {
  const unsupported = vi.fn().mockRejectedValue(new Error("not implemented"));
  return {
    listApplications: vi.fn().mockResolvedValue({ applications: [] }),
    listPlans: vi.fn().mockResolvedValue({ plans: [] }),
    listRuns: vi.fn().mockResolvedValue({ runs: [] }),
    savePlan: unsupported,
    previewPlan: unsupported,
    checkReadiness: unsupported,
    startPlan: unsupported,
    renderManifest: unsupported,
    submitSafePr: unsupported,
    runAction: unsupported,
    ...overrides,
  };
}
