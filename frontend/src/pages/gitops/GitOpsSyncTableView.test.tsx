// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { I18nProvider } from "../../shared/i18n";
import {
  ProductNotificationsProvider,
  useProductNotifications,
} from "../../features/notifications/ProductNotificationsProvider";
import type {
  GitOpsSyncTarget,
  ReleaseApplication,
} from "../../features/gitops/gitOpsContract";
import { GitOpsSyncTableView } from "./GitOpsSyncTableView";
import { gitOpsPort, gitOpsRefreshPolicies } from "./GitOpsPage.testSupport";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("GitOpsSyncTableView", () => {
  it("shows compact observed data and expands one row without fetching invented details", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    vi.mocked(port.listSyncTargets).mockResolvedValue([{
      id: "checkout-api:production",
      applicationId: "checkout-api",
      applicationName: "Checkout API",
      clusterId: "production-cluster",
      namespace: "checkout",
      environment: "production",
      syncStatus: "out_of_sync",
      revision: "f0123456789abcdef0123456789abcdef",
      observedAt: "2026-07-15T01:02:03Z",
    }]);
    renderView(port);

    expect(await screen.findByText("Checkout API")).toBeTruthy();
    expect(screen.getByText("f012345678…89abcdef")).toBeTruthy();
    expect(screen.getByText("Needs sync")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Details: Checkout API" }));

    const details = screen.getByLabelText("Checkout API Details");
    expect(within(details).getByText("checkout-api")).toBeTruthy();
    expect(within(details).getByText("production-cluster / checkout")).toBeTruthy();
    expect(within(details).getByText("f0123456789abcdef0123456789abcdef")).toBeTruthy();
    expect(port.listSyncTargets).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close: Checkout API" }));
    expect(screen.queryByLabelText("Checkout API Details")).toBeNull();
  });

  it("links controller evidence to the canonical resource detail route", async () => {
    const port = gitOpsPort();
    vi.mocked(port.listSyncTargets).mockResolvedValue([{
      id: "controller:cluster-a:application-uid",
      applicationId: "application-uid",
      applicationName: "storefront",
      clusterId: "cluster-a",
      namespace: "argocd",
      environment: null,
      syncStatus: "Synced",
      revision: "abc123",
      observedAt: "2026-07-17T01:02:03Z",
      authority: "controller",
      provider: "argo",
      kind: "Application",
      health: "Healthy",
      resourceLocator: {
        clusterId: "cluster-a",
        apiVersion: "argoproj.io/v1alpha1",
        kind: "Application",
        namespace: "argocd",
        name: "storefront",
      },
      freshness: "partial",
      partialReasonCodes: ["crd_discovery_forbidden"],
    }]);
    renderView(port);

    const link = await screen.findByRole("link", { name: "storefront" });
    expect(link.getAttribute("href")).toBe(
      "/gitops/resource?cluster=cluster-a&apiVersion=argoproj.io%2Fv1alpha1&kind=Application&namespace=argocd&name=storefront",
    );
    expect(screen.getByText("crd_discovery_forbidden")).toBeTruthy();
  });

  it("keeps the no-target state informative and offers the real registration action", async () => {
    const port = gitOpsPort();
    vi.mocked(port.listSyncTargets).mockResolvedValue([]);
    renderView(port);

    expect(await screen.findByText("No deployment targets")).toBeTruthy();
    expect(screen.getByText("Register an application deployment target to see its sync status here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New deployment target" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  it("leaves deployment discovery to the global command search", async () => {
    const port = gitOpsPort();
    vi.mocked(port.listSyncTargets).mockResolvedValue([{
      id: "checkout-api:production",
      applicationId: "checkout-api",
      applicationName: "Checkout API",
      clusterId: "production-east",
      namespace: "checkout",
      environment: "production",
      syncStatus: "out_of_sync",
      revision: "abc123",
      observedAt: "2026-07-15T01:02:03Z",
    }, {
      id: "inventory-api:staging",
      applicationId: "inventory-api",
      applicationName: "Inventory API",
      clusterId: "staging-east",
      namespace: "inventory",
      environment: "staging",
      syncStatus: "synced",
      revision: "def456",
      observedAt: "2026-07-15T01:02:03Z",
    }]);
    renderView(port);

    expect(await screen.findByText("Checkout API")).toBeTruthy();
    expect(screen.getByText("Inventory API")).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(port.listSyncTargets).toHaveBeenCalledTimes(1);
  });

  it("shares server-owned row retries and count cadence without a browser fallback", async () => {
    vi.useFakeTimers();
    const port = gitOpsPort();
    vi.mocked(port.listSyncTargets).mockResolvedValue([]);
    const refreshPolicies = gitOpsRefreshPolicies();
    renderView(port, refreshPolicies);

    await act(async () => undefined);
    expect(port.listSyncTargets).toHaveBeenCalledTimes(1);
    expect(refreshPolicies.getPolicy).toHaveBeenCalledWith("gitops_rows", expect.any(AbortSignal));
    expect(refreshPolicies.getPolicy).toHaveBeenCalledWith("gitops_counts", expect.any(AbortSignal));

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await act(async () => vi.advanceTimersByTimeAsync(2_000));
      expect(port.listSyncTargets).toHaveBeenCalledTimes(attempt + 2);
    }

    await act(async () => vi.advanceTimersByTimeAsync(59_999));
    expect(port.listSyncTargets).toHaveBeenCalledTimes(5);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(port.listSyncTargets).toHaveBeenCalledTimes(6);
  });

  it("stays manual when the server policy inventory is unavailable", async () => {
    vi.useFakeTimers();
    const port = gitOpsPort();
    vi.mocked(port.listSyncTargets).mockResolvedValue([]);
    const refreshPolicies = gitOpsRefreshPolicies();
    vi.mocked(refreshPolicies.getPolicy).mockRejectedValue(new Error("policy unavailable"));

    renderView(port, refreshPolicies);
    await act(async () => undefined);
    await act(async () => vi.advanceTimersByTimeAsync(3_600_000));

    expect(port.listSyncTargets).toHaveBeenCalledTimes(1);
  });

  it("connects with the authorized server credential and reflects the registered repository", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    const created: ReleaseApplication = {
      id: "inventory-api",
      name: "Inventory API",
      repository: "team/inventory-api",
      branch: "main",
      clusterId: "production-cluster",
      manifestPath: "deploy.yaml",
    };
    const reflected: GitOpsSyncTarget = {
      id: "inventory-api:production-cluster",
      applicationId: "inventory-api",
      applicationName: "Inventory API",
      clusterId: "production-cluster",
      namespace: "default",
      environment: "development",
      syncStatus: null,
      revision: null,
      observedAt: null,
      authority: "registered",
      provider: "internal",
      kind: "GitOpsApplication",
    };
    let resolveRegistration!: (value: ReleaseApplication) => void;
    let resolveReflection!: (value: GitOpsSyncTarget[]) => void;
    let registrationComplete = false;
    const reflection = new Promise<GitOpsSyncTarget[]>((resolve) => {
      resolveReflection = resolve;
    });
    vi.mocked(port.listSyncTargets).mockImplementation(() => (
      registrationComplete ? reflection : Promise.resolve([])
    ));
    vi.mocked(port.connectApplication).mockImplementation(() => new Promise((resolve) => {
      resolveRegistration = (value) => {
        registrationComplete = true;
        resolve(value);
      };
    }));
    renderView(port);

    await screen.findByText("No deployment targets");
    const trigger = screen.getByRole("button", { name: "Connect repository" });
    await user.click(trigger);
    let dialog = screen.getByRole("dialog", { name: "Connect Git repository" });
    expect(dialog.querySelector("input[type='password']")).toBeNull();
    expect(within(dialog).queryByLabelText(/token/i)).toBeNull();
    expect(within(dialog).queryByLabelText("Branch")).toBeNull();
    expect(within(dialog).queryByLabelText("Manifest path")).toBeNull();
    expect(dialog.querySelectorAll("[data-stage]")).toHaveLength(6);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    dialog = screen.getByRole("dialog", { name: "Connect Git repository" });
    await user.type(within(dialog).getByLabelText("Target name"), "Inventory API");
    await user.type(within(dialog).getByLabelText("Git repository"), "team/inventory-api");
    await user.click(within(dialog).getByRole("button", { name: "Connect repository" }));

    await waitFor(() => expect(port.connectApplication).toHaveBeenCalledWith({
      name: "Inventory API",
      repository: "team/inventory-api",
      branch: "main",
      manifestPath: "deploy.yaml",
      clusterId: "production-cluster",
      namespace: "default",
      environment: "development",
      sourceType: "raw",
    }));
    expect(vi.mocked(port.connectApplication).mock.calls[0]?.[0]).not.toHaveProperty("token");

    await act(async () => resolveRegistration(created));
    await waitFor(() => expect(
      screen.getByRole("dialog", { name: "Connect Git repository" })
        .querySelector("[data-stage='status']")?.getAttribute("data-state"),
    ).toBe("active"));
    expect(port.getRepositoryConnectionStatus).toHaveBeenCalledWith("team/inventory-api");
    expect(port.listSyncTargets).toHaveBeenCalled();

    await act(async () => resolveReflection([reflected]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Inventory API")).toBeTruthy();
    expect(screen.getByTestId("notification-probe").textContent)
      .toBe("repository-connected:inventory-api|/deploy?section=repositories");
    const calls = [
      port.probeRepository,
      port.listRepositoryBranches,
      port.listRepositoryManifests,
      port.validateRepositoryManifest,
      port.connectApplication,
      port.getRepositoryConnectionStatus,
      port.listSyncTargets,
    ].map((mock) => vi.mocked(mock).mock.invocationCallOrder.at(-1) ?? 0);
    expect(calls).toEqual([...calls].sort((left, right) => left - right));
  });
});

function renderView(
  port: ReturnType<typeof gitOpsPort>,
  refreshPolicies = gitOpsRefreshPolicies(),
) {
  return render(
    <MemoryRouter>
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ProductNotificationsProvider>
          <GitOpsSyncTableView port={port} refreshPolicies={refreshPolicies} />
          <NotificationProbe />
        </ProductNotificationsProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

function NotificationProbe() {
  const { notifications } = useProductNotifications();
  const first = notifications[0];
  return (
    <output data-testid="notification-probe">
      {first ? `${first.id}|${first.href}` : ""}
    </output>
  );
}
