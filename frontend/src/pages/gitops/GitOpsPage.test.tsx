// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  blockedManifest,
  blockedReadiness,
  gitOpsPort,
  installWorkflowGraphDomStubs,
  plan,
  renderGitOps,
} from "./GitOpsPage.testSupport";

beforeEach(() => {
  installWorkflowGraphDomStubs();
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
  it("starts with plan blocks and opens the selected plan overview", async () => {
    const user = userEvent.setup();
    renderGitOps("/gitops");

    expect(await screen.findByRole("heading", { name: "Select plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Alpha release" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Bravo release" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Workflow workspace" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open Bravo release" }));

    await waitFor(() => expect(screen.getByTestId("gitops-location").textContent)
      .toBe("/gitops?plan=plan-b&view=overview"));
    expect(await screen.findByRole("navigation", { name: "Workflow workspace" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Plan list" }));
    await waitFor(() => expect(screen.getByTestId("gitops-location").textContent).toBe("/gitops"));
    expect(await screen.findByRole("button", { name: "Open Alpha release" })).toBeTruthy();
  });

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
    expect(within(navigation).queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("navigation", { name: "Workflow workspace" })).toHaveLength(1);
    const workspaceHeader = screen.getByTestId("workflow-workspace-header");
    expect(within(workspaceHeader).getByRole("heading", { name: "Edit plan" })).toBeTruthy();
    expect(within(workspaceHeader).getByRole("button", { name: "Save changes" })).toBeTruthy();

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
    const workspaceHeader = screen.getByTestId("workflow-workspace-header");
    expect(within(workspaceHeader).getByRole("heading", { name: "YAML / PR" })).toBeTruthy();
    expect(within(workspaceHeader).getByRole("button", { name: "Generate YAML" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "New plan" }));

    expect(await screen.findByRole("heading", { name: "Create release plan" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Workflow workspace" })).toBeNull();
    expect(screen.getByRole("list", { name: "Plan creation progress" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter a plan name.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Plan name")));
  });

  it("keeps the overview next action in the workspace header", async () => {
    const user = userEvent.setup();
    renderGitOps("/gitops?plan=plan-a&view=overview");

    const workspaceHeader = await screen.findByTestId("workflow-workspace-header");
    expect(within(workspaceHeader).getByRole("heading", { name: "Overview" })).toBeTruthy();
    expect(screen.getByLabelText("Release workflow graph").classList.contains("hidden")).toBe(false);
    expect(screen.queryByRole("heading", { name: "Release order" })).toBeNull();
    const requiredFields = within(workspaceHeader).getByRole("button", { name: "2 required fields" });

    await user.click(requiredFields);
    await waitFor(() => expect(screen.getByTestId("gitops-location").textContent)
      .toBe("/gitops?plan=plan-a&view=edit"));
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
