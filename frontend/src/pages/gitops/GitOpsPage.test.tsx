// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
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

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    return window.setTimeout(() => callback(0), 0);
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GitOpsPage workspace navigation", () => {
  it("keeps one canonical tab row and changes the selected plan in place", async () => {
    const user = userEvent.setup();
    renderGitOps("/gitops?plan=plan-a&view=edit");

    const navigation = await screen.findByRole("navigation", { name: "Workflow workspace" });
    expect((screen.getByLabelText("Plan name") as HTMLInputElement).value).toBe("Alpha release");
    expect(within(navigation).getAllByRole("tab")).toHaveLength(4);
    expect(within(navigation).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Edit plan",
      "Runs",
      "YAML / PR",
    ]);
    expect(screen.getAllByRole("navigation", { name: "Workflow workspace" })).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText("Select plan"), "plan-b");

    await waitFor(() => expect((screen.getByLabelText("Plan name") as HTMLInputElement).value)
      .toBe("Bravo release"));
    await waitFor(() => expect(screen.getByTestId("gitops-location").textContent)
      .toBe("/gitops?plan=plan-b&view=edit"));
  });

  it("uses the same URL-backed tabs and removes them from the creation flow", async () => {
    const user = userEvent.setup();
    renderGitOps("/gitops?plan=plan-a&view=edit");
    await screen.findByRole("navigation", { name: "Workflow workspace" });

    await user.click(screen.getByRole("tab", { name: "YAML / PR" }));
    await waitFor(() => expect(screen.getByTestId("gitops-location").textContent)
      .toBe("/gitops?plan=plan-a&view=yaml"));

    await user.click(screen.getByRole("button", { name: "New plan" }));

    expect(await screen.findByRole("heading", { name: "Create release plan" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Workflow workspace" })).toBeNull();
    expect(screen.getByRole("list", { name: "Plan creation progress" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter a plan name.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Plan name")));
  });

  it("turns readiness blockers into one direct field-fix path", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    vi.mocked(port.checkReadiness).mockResolvedValue(blockedReadiness());
    renderGitOps("/gitops?plan=plan-a&view=runs", port);

    await user.click(await screen.findByRole("button", { name: "Run pre-check" }));

    expect(await screen.findByText("Checkout API")).toBeTruthy();
    expect(screen.getByText("Commit SHA")).toBeTruthy();
    expect(screen.getByText("Container image")).toBeTruthy();
    expect(screen.queryByText("checkout-api is missing commit_sha")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Fix fields" }));

    await waitFor(() => expect(screen.getByTestId("gitops-location").textContent)
      .toBe("/gitops?plan=plan-a&view=edit"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Commit SHA")));
  });

  it("keeps Safe PR blocked and discards generated state when the target changes", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    const release = plan("plan-a", "Alpha release", "checkout-api");
    release.steps.push({
      ...plan("plan-b", "Bravo release", "payments-worker").steps[0],
      step_id: "plan-a-step-2",
      position: 1,
    });
    vi.mocked(port.listPlans).mockResolvedValue([release]);
    vi.mocked(port.renderManifest).mockResolvedValue(blockedManifest());
    renderGitOps("/gitops?plan=plan-a&view=yaml", port);

    expect(await screen.findByRole("button", { name: "Generate YAML" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit Safe PR" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Generate YAML" }));

    expect(await screen.findByText("Enter the container image for this release step.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fix fields" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit Safe PR" })).toBeNull();
    expect(screen.queryByText("image is required")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Render target"), "1");

    await waitFor(() => expect(screen.queryByText("Enter the container image for this release step.")).toBeNull());
    expect(screen.queryByRole("button", { name: "Fix fields" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit Safe PR" })).toBeNull();
    expect(screen.queryByText(/apiVersion: apps\/v1/)).toBeNull();
  });
});

function renderGitOps(initialEntry: string, port: GitOpsPort = gitOpsPort()) {
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

function gitOpsPort(): GitOpsPort {
  return {
    listApplications: vi.fn().mockResolvedValue(applications),
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

function blockedReadiness(): ReleaseReadiness {
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

function blockedManifest(): GeneratedManifest {
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

function plan(planId: string, name: string, applicationId: string): ReleasePlan {
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
