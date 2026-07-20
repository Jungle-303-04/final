import { describe, expect, it, vi } from "vitest";
import { GitOpsPortFailure } from "./gitOpsContract";
import { createGitOpsAdapter } from "./createGitOpsAdapter";
import {
  detailFixture,
  endpointFixture,
  mappedDetailFixture,
} from "./createGitOpsAdapter.testSupport";

describe("createGitOpsAdapter", () => {
  it("maps provider-neutral detail availability without manufacturing a diff", async () => {
    const endpoints = endpointFixture({
      getApplicationDetail: vi.fn().mockResolvedValue({ application: detailFixture() }),
    });

    await expect(createGitOpsAdapter(endpoints).getApplicationDetail("app-storefront"))
      .resolves.toEqual(mappedDetailFixture());
    expect(endpoints.getApplicationDetail).toHaveBeenCalledWith("app-storefront", undefined);
  });

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

  it("maps the canonical overview in one call without deployment N+1", async () => {
    const endpoints = endpointFixture({
      listOverview: vi.fn().mockResolvedValue({
        workspace_id: "workspace-a",
        scopes: [],
        items: [{
          id: "controller:prod-east:application-uid",
          authority: "controller",
          provider: "argo",
          role: "controller",
          display_name: "Checkout API",
          application_ids: ["app-checkout", "app-storefront"],
          binding_id: null,
          scope: {
            workspace_id: "workspace-a",
            cluster_id: "prod-east",
            namespaces: ["checkout"],
            freshness: "live",
          },
          resource: {
            api_group: "argoproj.io",
            version: "v1alpha1",
            kind: "Application",
            namespace: "checkout",
            name: "checkout-api",
            uid: "application-uid",
          },
          environment: null,
          status: "Synced",
          health: "Healthy",
          revision: "81de44f",
          observed_at: "2026-07-15T01:02:03Z",
          labels: { team: "checkout" },
          capabilities: {
            scope: {
              workspace_id: "workspace-a",
              cluster_id: "prod-east",
              namespaces: ["checkout"],
              freshness: "live",
            },
            resource: {
              api_group: "argoproj.io",
              version: "v1alpha1",
              kind: "Application",
              namespace: "checkout",
              name: "checkout-api",
              uid: "application-uid",
            },
            revision: "17",
            actions: [],
          },
          partial_reason_codes: [],
        }],
        kind_counts: [],
        coverage: {
          state: "complete",
          registered_count: 0,
          controller_count: 1,
          returned_count: 1,
          reason_codes: [],
        },
        observed_at: "2026-07-15T01:02:03Z",
      }),
    });

    await expect(createGitOpsAdapter(endpoints).listSyncTargets()).resolves.toEqual([{
      id: "controller:prod-east:application-uid",
      applicationIds: ["app-checkout", "app-storefront"],
      applicationId: "app-checkout",
      applicationName: "Checkout API",
      clusterId: "prod-east",
      namespace: "checkout",
      environment: null,
      syncStatus: "Synced",
      revision: "81de44f",
      observedAt: "2026-07-15T01:02:03Z",
      authority: "controller",
      provider: "argo",
      kind: "Application",
      health: "Healthy",
      resourceLocator: {
        clusterId: "prod-east",
        apiVersion: "argoproj.io/v1alpha1",
        kind: "Application",
        namespace: "checkout",
        name: "checkout-api",
      },
      freshness: "live",
      partialReasonCodes: [],
    }]);
    expect(endpoints.listOverview).toHaveBeenCalledTimes(1);
    expect(endpoints.listApplications).not.toHaveBeenCalled();
  });

  it("rejects overview rows without a stable identity", async () => {
    const endpoints = endpointFixture({
      listOverview: vi.fn().mockResolvedValue({
        workspace_id: "workspace-a",
        scopes: [],
        items: [{ id: "" }],
        kind_counts: [],
        coverage: {
          state: "complete",
          registered_count: 0,
          controller_count: 1,
          returned_count: 1,
          reason_codes: [],
        },
        observed_at: null,
      }),
    });

    await expect(createGitOpsAdapter(endpoints).listSyncTargets()).rejects.toMatchObject({
      code: "invalid-response",
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

  it("forwards the exact workflow approval identity and decision", async () => {
    const decideApproval = vi.fn().mockResolvedValue({ accepted: true });
    const port = createGitOpsAdapter(endpointFixture({ decideApproval }));

    await expect(port.decideApproval("approval-a", "grant", "reviewed"))
      .resolves.toBeUndefined();

    expect(decideApproval).toHaveBeenCalledWith(
      "approval-a",
      "grant",
      "reviewed",
      undefined,
    );
  });

});
