import { describe, expect, it, vi } from "vitest";
import { GitOpsPortFailure } from "./gitOpsContract";
import type { GitOpsEndpointDependencies } from "./gitOpsEndpointContract";
import { createGitOpsAdapter } from "./createGitOpsAdapter";

describe("createGitOpsAdapter", () => {
  it("keeps release planning compatible with the strict BQ-039 catalog identity", async () => {
    const endpoints = endpointFixture({
      listApplications: vi.fn().mockResolvedValue({ applications: [{
        id: "app-checkout",
        name: "checkout-api",
        repository_ref: "opsia/checkout",
        default_branch: "main",
        manifest_path: "deploy/prod",
      }] }),
    });

    await expect(createGitOpsAdapter(endpoints).listApplications()).resolves.toEqual([{
      id: "app-checkout",
      name: "checkout-api",
      repository: "opsia/checkout",
      branch: "main",
      clusterId: "",
      manifestPath: "deploy/prod",
    }]);
  });

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

  it("maps connected clusters and a newly registered deployment target", async () => {
    const endpoints = endpointFixture({
      listClusters: vi.fn().mockResolvedValue({ clusters: [{
        cluster_id: "prod-east",
        name: "Production East",
        environment: "production",
        connection_status: "online",
      }] }),
      connectApplication: vi.fn().mockResolvedValue({ application: {
        application_id: "inventory-api",
        name: "Inventory API",
        repo_ref: "team/inventory-api",
        default_branch: "main",
        cluster_id: "prod-east",
        manifest_path: "deploy.yaml",
      } }),
    });
    const port = createGitOpsAdapter(endpoints);

    await expect(port.listClusters()).resolves.toEqual([{
      id: "prod-east",
      name: "Production East",
      environment: "production",
      connectionStatus: "online",
    }]);
    await expect(port.connectApplication({
      name: "Inventory API",
      repository: "team/inventory-api",
      branch: "main",
      manifestPath: "deploy.yaml",
      clusterId: "prod-east",
      namespace: "default",
      environment: "production",
    })).resolves.toEqual({
      id: "inventory-api",
      name: "Inventory API",
      repository: "team/inventory-api",
      branch: "main",
      clusterId: "prod-east",
      manifestPath: "deploy.yaml",
    });
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
    listClusters: vi.fn().mockResolvedValue({ clusters: [] }),
    connectApplication: unsupported,
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
