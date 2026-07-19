import { describe, expect, it, vi } from "vitest";
import { GitOpsPortFailure } from "./gitOpsContract";
import type { GitOpsEndpointDependencies } from "./gitOpsEndpointContract";
import { createGitOpsAdapter } from "./createGitOpsAdapter";

describe("createGitOpsAdapter", () => {
  it("maps provider-neutral detail availability without manufacturing a diff", async () => {
    const endpoints = endpointFixture({
      getApplicationDetail: vi.fn().mockResolvedValue({ application: detailFixture() }),
    });

    await expect(createGitOpsAdapter(endpoints).getApplicationDetail("app-storefront")).resolves.toEqual({
      applicationId: "app-storefront",
      name: "storefront",
      resource: {
        apiGroup: "opsia.io",
        version: "v1",
        kind: "GitOpsApplication",
        namespace: "storefront",
        name: "storefront",
        uid: "app-storefront",
      },
      scope: {
        availability: "available",
        scope: {
          workspaceId: "workspace-a",
          clusterId: "cluster-a",
          namespaces: ["storefront"],
          freshness: "partial",
        },
        reasonCode: null,
      },
      source: {
        repositoryRef: "opsia/storefront",
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

  it("exposes the server-owned repository discovery and connection sequence", async () => {
    const endpoints = endpointFixture({
      probeRepository: vi.fn().mockResolvedValue({
        repo_ref: "https://github.com/team/inventory-api",
        normalized_repo_ref: "team/inventory-api",
        valid: true,
        reachable: true,
        default_branch: "trunk",
        private: false,
        html_url: "https://github.com/team/inventory-api",
        warnings: [],
        errors: [],
      }),
      listRepositoryBranches: vi.fn().mockResolvedValue({
        repo_ref: "team/inventory-api",
        default_branch: "trunk",
        branches: [{ name: "trunk", protected: true, default: true }],
        warnings: [],
      }),
      listRepositoryManifests: vi.fn().mockResolvedValue({
        repo_ref: "team/inventory-api",
        branch: "trunk",
        candidates: [{
          path: "deploy/production",
          source_type: "kustomize",
          display_name: "Production overlay",
          reason: "kustomization.yaml",
        }],
        warnings: [],
      }),
      validateRepositoryManifest: vi.fn().mockResolvedValue({
        repo_ref: "team/inventory-api",
        branch: "trunk",
        manifest_path: "deploy/production",
        valid: true,
        status: "valid",
        validation_mode: "kustomize",
        resource_count: 4,
        resources: [],
        warnings: [],
        errors: [],
      }),
      getRepositoryConnectionStatus: vi.fn().mockResolvedValue({
        repo_ref: "team/inventory-api",
        repository_id: "repo-inventory",
        repository_status: "active",
        connection_stage: "ready",
        terminal: true,
        refresh_after_seconds: null,
      }),
    });
    const port = createGitOpsAdapter(endpoints);

    await expect(port.probeRepository("team/inventory-api")).resolves.toMatchObject({
      normalizedRepoRef: "team/inventory-api",
      reachable: true,
    });
    await expect(port.listRepositoryBranches("team/inventory-api")).resolves.toMatchObject({
      defaultBranch: "trunk",
      branches: [{ name: "trunk", default: true, protected: true }],
    });
    await expect(port.listRepositoryManifests("team/inventory-api", "trunk")).resolves.toMatchObject({
      candidates: [{
        path: "deploy/production",
        sourceType: "kustomize",
      }],
    });
    await expect(port.validateRepositoryManifest({
      repoRef: "team/inventory-api",
      branch: "trunk",
      manifestPath: "deploy/production",
      sourceType: "kustomize",
    })).resolves.toMatchObject({
      valid: true,
      resourceCount: 4,
    });
    await expect(port.getRepositoryConnectionStatus("team/inventory-api")).resolves.toEqual({
      repoRef: "team/inventory-api",
      repositoryId: "repo-inventory",
      repositoryStatus: "active",
      connectionStage: "ready",
      terminal: true,
      refreshAfterSeconds: null,
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
          application_ids: [],
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
      applicationId: "application-uid",
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

function endpointFixture(
  overrides: Partial<GitOpsEndpointDependencies> = {},
): GitOpsEndpointDependencies {
  const unsupported = vi.fn().mockRejectedValue(new Error("not implemented"));
  return {
    getApplicationDetail: vi.fn().mockResolvedValue({ application: detailFixture() }),
    listOverview: vi.fn().mockResolvedValue({
      workspace_id: "workspace-a",
      scopes: [],
      items: [],
      kind_counts: [],
      coverage: {
        state: "complete",
        registered_count: 0,
        controller_count: 0,
        returned_count: 0,
        reason_codes: [],
      },
      observed_at: null,
    }),
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

function detailFixture() {
  return {
    application_id: "app-storefront",
    name: "storefront",
    resource: {
      api_group: "opsia.io",
      version: "v1",
      kind: "GitOpsApplication",
      namespace: "storefront",
      name: "storefront",
      uid: "app-storefront",
    },
    scope: {
      availability: "available" as const,
      scope: {
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: ["storefront"],
        freshness: "partial" as const,
      },
      reason_code: null,
    },
    source: {
      repository_ref: "opsia/storefront",
      default_branch: "main",
      manifest_path: "deploy/production",
    },
    desired_live_diff: {
      availability: "unavailable" as const,
      source_revision: "abc123",
      live_observation_revision: null,
      reason_code: "live_observation_not_integrated",
    },
    operation: {
      availability: "partial" as const,
      in_progress: true,
      workflow_run_id: "run-1",
      status: "applying",
      observed_at: "2026-07-16T09:00:00Z",
      reason_code: "provider_operation_not_integrated",
    },
    capabilities: [{
      action: "refresh" as const,
      authorization: "allowed" as const,
      availability: "unavailable" as const,
      enabled: false,
      operation_blocked: false,
      reason_code: "provider_refresh_not_integrated",
    }, {
      action: "sync" as const,
      authorization: "allowed" as const,
      availability: "unavailable" as const,
      enabled: false,
      operation_blocked: true,
      reason_code: "operation_in_progress",
    }],
  };
}

function resourceInsightsFixture() {
  const resource = {
    api_group: "argoproj.io",
    version: "v1alpha1",
    kind: "Application",
    namespace: "argocd",
    name: "storefront",
    uid: "app-uid",
  };
  const scope = {
    workspace_id: "workspace-a",
    cluster_id: "cluster-a",
    namespaces: ["argocd"],
    freshness: "live" as const,
  };
  return {
    scope,
    resource,
    resource_version: "17",
    provider: "argo" as const,
    status: "Synced",
    health: "Healthy",
    revision: "main@sha1:abc",
    source: null,
    conditions: [],
    history: [],
    capabilities: {
      scope,
      resource,
      revision: "sha256:capability",
      actions: ["refresh", "sync"] as ("refresh" | "sync")[],
    },
  };
}
