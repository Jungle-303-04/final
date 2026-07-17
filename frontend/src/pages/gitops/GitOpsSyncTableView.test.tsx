// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { GitOpsSyncTableView } from "./GitOpsSyncTableView";
import { gitOpsPort, gitOpsRefreshPolicies } from "./GitOpsPage.testSupport";

afterEach(() => {
  cleanup();
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

  it("keeps the no-target state informative and offers the real registration action", async () => {
    const port = gitOpsPort();
    vi.mocked(port.listSyncTargets).mockResolvedValue([]);
    renderView(port);

    expect(await screen.findByText("No deployment targets")).toBeTruthy();
    expect(screen.getByText("Register an application deployment target to see its sync status here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New deployment target" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  it("filters the authorized projection and clears an empty result without another request", async () => {
    const user = userEvent.setup();
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

    const search = await screen.findByRole("searchbox", { name: "Search deployments" });
    await user.type(search, "production");
    expect(screen.getByText("Checkout API")).toBeTruthy();
    expect(screen.queryByText("Inventory API")).toBeNull();

    await user.clear(search);
    await user.type(search, "missing");
    expect(screen.getByText("No matching deployments")).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "Clear search" })[0]);

    expect(screen.getByText("Checkout API")).toBeTruthy();
    expect(screen.getByText("Inventory API")).toBeTruthy();
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
});

function renderView(
  port: ReturnType<typeof gitOpsPort>,
  refreshPolicies = gitOpsRefreshPolicies(),
) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <GitOpsSyncTableView port={port} refreshPolicies={refreshPolicies} />
    </I18nProvider>,
  );
}
