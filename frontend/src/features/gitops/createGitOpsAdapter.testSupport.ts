import { vi } from "vitest";

import type { GitOpsEndpointDependencies } from "./gitOpsEndpointContract";

export function endpointFixture(
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
    probeRepository: unsupported, listRepositoryBranches: unsupported, listRepositoryManifests: unsupported, validateRepositoryManifest: unsupported, getRepositoryConnectionStatus: unsupported,
    connectApplication: unsupported,
    listPlans: vi.fn().mockResolvedValue({ plans: [] }),
    listRuns: vi.fn().mockResolvedValue({ runs: [] }),
    savePlan: unsupported,
    previewPlan: unsupported,
    checkReadiness: unsupported,
    startPlan: unsupported,
    decideApproval: unsupported,
    renderManifest: unsupported,
    submitSafePr: unsupported,
    runAction: unsupported,
    ...overrides,
  };
}

export function detailFixture() {
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

export function mappedDetailFixture() {
  return {
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
  };
}

export function resourceInsightsFixture() {
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
