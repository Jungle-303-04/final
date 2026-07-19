import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { vi } from "vitest";
import type {
  GeneratedManifest,
  GitOpsPort,
  ReleaseApplication,
  ReleasePlan,
  ReleaseReadiness,
} from "../../features/gitops/gitOpsContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { GitOpsPage } from "./GitOpsPage";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import type { RcaContextPort } from "../../features/issues/rcaContextContract";

export function installWorkflowGraphDomStubs() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "DOMMatrixReadOnly",
    class {
      m22 = 1;
    },
  );
}

export function renderGitOps(
  initialEntry: string,
  port: GitOpsPort = gitOpsPort(),
  rcaContextPort?: RcaContextPort,
) {
  const router = createMemoryRouter([{
    path: "/gitops/*",
    element: (
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <UnifiedFilterProvider>
          <GitOpsPage port={port} rcaContextPort={rcaContextPort} refreshPolicies={gitOpsRefreshPolicies()} />
          <LocationProbe />
        </UnifiedFilterProvider>
      </I18nProvider>
    ),
  }], { initialEntries: [initialEntry] });
  return { ...render(<RouterProvider router={router} />), port, router };
}

export function gitOpsRefreshPolicies(): BrowserRefreshPolicyRegistry<"gitops_rows" | "gitops_counts"> {
  return {
    getPolicy: vi.fn(async (key) => ({
      staleAfterSeconds: key === "gitops_counts" ? 10 : 30,
      refreshAfterSeconds: key === "gitops_counts" ? 60 : 120,
      keepLastSuccess: true as const,
      pauseWhenHidden: true as const,
      eventInvalidation: false,
      retryAfterSeconds: key === "gitops_rows" ? 2 : null,
      retryLimit: key === "gitops_rows" ? 4 : null,
      postMutationRefreshAfterSeconds: null,
    })),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="gitops-location">{location.pathname}{location.search}</span>;
}

export function gitOpsPort(): GitOpsPort {
  return {
    getApplicationDetail: vi.fn().mockResolvedValue({
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
      scope: { availability: "unavailable", scope: null, reasonCode: "binding_scope_unavailable" },
      source: { repositoryRef: null, defaultBranch: null, manifestPath: null },
      desiredLiveDiff: {
        availability: "unavailable",
        sourceRevision: null,
        liveObservationRevision: null,
        reasonCode: "source_revision_unavailable",
      },
      operation: {
        availability: "unavailable",
        inProgress: null,
        workflowRunId: null,
        status: null,
        observedAt: null,
        reasonCode: "workflow_operation_unobserved",
      },
      capabilities: [{
        action: "refresh",
        authorization: "denied",
        availability: "unavailable",
        enabled: false,
        operationBlocked: false,
        reasonCode: "not_authorized",
      }, {
        action: "sync",
        authorization: "denied",
        availability: "unavailable",
        enabled: false,
        operationBlocked: false,
        reasonCode: "not_authorized",
      }],
    }),
    listApplications: vi.fn().mockResolvedValue(applications),
    listSyncTargets: vi.fn().mockResolvedValue([{
      id: "checkout-api:production",
      applicationId: "checkout-api",
      applicationName: "Checkout API",
      clusterId: "production-cluster",
      namespace: "checkout",
      environment: "production",
      syncStatus: "synced",
      revision: "81de44f",
      observedAt: "2026-07-15T01:02:03Z",
    }]),
    listClusters: vi.fn().mockResolvedValue([{
      id: "production-cluster",
      name: "Production cluster",
      environment: "production",
      connectionStatus: "online",
    }]),
    probeRepository: vi.fn().mockResolvedValue({
      repoRef: "team/inventory-api",
      normalizedRepoRef: "team/inventory-api",
      valid: true,
      reachable: true,
      defaultBranch: "main",
      private: false,
      htmlUrl: "https://github.com/team/inventory-api",
      warnings: [],
      errors: [],
    }),
    listRepositoryBranches: vi.fn().mockResolvedValue({
      repoRef: "team/inventory-api",
      defaultBranch: "main",
      branches: [{ name: "main", protected: true, default: true }],
      warnings: [],
    }),
    listRepositoryManifests: vi.fn().mockResolvedValue({
      repoRef: "team/inventory-api",
      branch: "main",
      candidates: [{
        path: "deploy.yaml",
        sourceType: "raw",
        displayName: "deploy.yaml",
        reason: "Kubernetes manifest",
      }],
      warnings: [],
    }),
    validateRepositoryManifest: vi.fn().mockResolvedValue({
      repoRef: "team/inventory-api",
      branch: "main",
      manifestPath: "deploy.yaml",
      sourceType: "raw",
      valid: true,
      status: "valid",
      validationMode: "raw",
      resourceCount: 1,
      warnings: [],
      errors: [],
    }),
    getRepositoryConnectionStatus: vi.fn().mockResolvedValue({
      repoRef: "team/inventory-api",
      repositoryId: "repo-inventory-api",
      repositoryStatus: "active",
      connectionStage: "ready",
      terminal: true,
      refreshAfterSeconds: null,
    }),
    connectApplication: vi.fn().mockResolvedValue({
      id: "inventory-api",
      name: "Inventory API",
      repository: "team/inventory-api",
      branch: "main",
      clusterId: "production-cluster",
      manifestPath: "deploy.yaml",
    }),
    listPlans: vi.fn().mockResolvedValue([
      plan("plan-a", "Alpha release", "checkout-api"),
      plan("plan-b", "Bravo release", "payments-worker"),
    ]),
    listRuns: vi.fn().mockResolvedValue([]),
    savePlan: vi.fn(async (value) => value),
    previewPlan: vi.fn().mockRejectedValue(new Error("not used")),
    checkReadiness: vi.fn().mockRejectedValue(new Error("not used")),
    startPlan: vi.fn().mockRejectedValue(new Error("not used")),
    renderManifest: vi.fn().mockRejectedValue(new Error("not used")),
    submitSafePr: vi.fn().mockRejectedValue(new Error("not used")),
    runAction: vi.fn().mockRejectedValue(new Error("not used")),
  };
}

export function blockedReadiness(): ReleaseReadiness {
  const blockers = [
    "checkout-api is missing commit_sha",
    "checkout-api is missing image",
  ];
  return {
    ready: false,
    mode: "review",
    summary: "2 blockers must be resolved",
    checks: [{
      check_id: "plan.required_inputs",
      name: "Required release inputs",
      status: "blocked",
      message: "Release input validation failed",
      blockers,
    }],
    impact: {
      summary: "1 step in 1 wave",
      runtime_mode: "review",
      live_side_effects: false,
      total_steps: 1,
      total_waves: 1,
      first_wave: 1,
      applications: ["checkout-api"],
      environments: ["production"],
      production_targets: ["checkout-api"],
      production_target_count: 1,
      first_wave_steps: [],
    },
    next_actions: [],
    blockers,
    warnings: [],
  };
}

export function blockedManifest(): GeneratedManifest {
  return {
    manifest: "apiVersion: apps/v1\nkind: Deployment\n",
    files: [{
      path: "deploy/checkout.yaml",
      content: "apiVersion: apps/v1",
      action: "upsert",
      description: "Generated manifest",
    }],
    resources: [{
      api_version: "apps/v1",
      kind: "Deployment",
      namespace: "default",
      name: "checkout-api",
    }],
    resource_count: 1,
    diagnostics: [{
      source: "manifest",
      severity: "error",
      message: "image is required",
      code: "manifest.image_required",
      line: 1,
      column: 1,
      end_line: 1,
      end_column: 1,
      path: "config.image",
    }],
    warnings: [],
    summary: "Manifest generated with one blocker",
  };
}

const applications: ReleaseApplication[] = [{
  id: "checkout-api",
  name: "Checkout API",
  repository: "team/checkout-api",
  branch: "main",
  clusterId: "production-with-a-long-cluster-name",
  manifestPath: "deploy/checkout/production/deployment.yaml",
}, {
  id: "payments-worker",
  name: "Payments Worker",
  repository: "team/payments-worker",
  branch: "release/2026-07",
  clusterId: "staging-east",
  manifestPath: "deploy/payments/worker.yaml",
}];

export function plan(planId: string, name: string, applicationId: string): ReleasePlan {
  const application = applications.find((item) => item.id === applicationId)!;
  return {
    plan_id: planId,
    name,
    description: `${name} description`,
    status: "draft",
    settings: { approval_policy: "manual_each_step", runtime_mode: "review" },
    steps: [{
      step_id: `${planId}-step-1`,
      application_id: applicationId,
      name: application.name,
      position: 0,
      depends_on: [],
      config: {
        environment: "production",
        strategy: "rolling",
        cluster_id: application.clusterId,
        namespace: "default",
        approval_gate: "inherit",
      },
    }],
  };
}
