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

export function renderGitOps(initialEntry: string, port: GitOpsPort = gitOpsPort()) {
  const router = createMemoryRouter([{
    path: "/gitops/*",
    element: (
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <UnifiedFilterProvider>
          <GitOpsPage port={port} />
          <LocationProbe />
        </UnifiedFilterProvider>
      </I18nProvider>
    ),
  }], { initialEntries: [initialEntry] });
  return { ...render(<RouterProvider router={router} />), port, router };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="gitops-location">{location.pathname}{location.search}</span>;
}

export function gitOpsPort(): GitOpsPort {
  return {
    listApplications: vi.fn().mockResolvedValue(applications),
    listClusters: vi.fn().mockResolvedValue([{
      id: "production-cluster",
      name: "Production cluster",
      environment: "production",
      connectionStatus: "online",
    }]),
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
