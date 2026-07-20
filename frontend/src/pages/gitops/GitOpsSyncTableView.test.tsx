// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { I18nProvider } from "../../shared/i18n";
import type { GitOpsSyncTarget, ReleaseApplication } from "../../features/gitops/gitOpsContract";
import { GitOpsSyncTableView } from "./GitOpsSyncTableView";
import { gitOpsPort, gitOpsRefreshPolicies } from "./GitOpsPage.testSupport";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GitOpsSyncTableView", () => {
  it("groups actual applications by repository and preserves per-target evidence", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    const applications: ReleaseApplication[] = [
      application("checkout", "Checkout", "team/platform"),
      application("inventory", "Inventory", "team/platform"),
    ];
    const rows: GitOpsSyncTarget[] = [
      target("checkout", "Checkout", "synced", "a1b2c3"),
      target("inventory", "Inventory", "out_of_sync", "d4e5f6"),
    ];
    vi.mocked(port.listApplications).mockResolvedValue(applications);
    vi.mocked(port.listSyncTargets).mockResolvedValue(rows);
    renderView(port);

    const repository = await screen.findByRole("row", { name: /team\/platform/u });
    expect(within(repository).getByText("2")).toBeTruthy();
    expect(within(repository).getByText("OutOfSync")).toBeTruthy();

    await user.click(within(repository).getByRole("button", { name: "Details: team/platform" }));
    expect(screen.getByText("Checkout")).toBeTruthy();
    expect(screen.getByText("Inventory")).toBeTruthy();
    expect(screen.getByText("a1b2c3")).toBeTruthy();
    expect(screen.getByText("d4e5f6")).toBeTruthy();
  });

  it("splits one shared sync observation across every application's actual repository", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    vi.mocked(port.listApplications).mockResolvedValue([
      application("checkout", "Checkout", "team/checkout"),
      application("inventory", "Inventory", "team/inventory"),
    ]);
    vi.mocked(port.listSyncTargets).mockResolvedValue([{
      ...target("checkout", "Checkout", "synced", "abcdef123456"),
      applicationIds: ["checkout", "inventory"],
    }]);
    renderView(port);

    const checkout = await screen.findByRole("row", { name: /team\/checkout/u });
    const inventory = screen.getByRole("row", { name: /team\/inventory/u });
    expect(within(checkout).getByText("1")).toBeTruthy();
    expect(within(inventory).getByText("1")).toBeTruthy();

    await user.click(within(checkout).getByRole("button", { name: "Details: team/checkout" }));
    expect(screen.getByText("Checkout")).toBeTruthy();
    expect(screen.getByText("abcdef123456")).toBeTruthy();
    expect(screen.queryByText("Inventory")).toBeNull();
    await user.click(within(inventory).getByRole("button", { name: "Details: team/inventory" }));
    expect(screen.getByText("Inventory")).toBeTruthy();
    expect(screen.getByText("abcdef123456")).toBeTruthy();
    expect(screen.queryByText("Checkout")).toBeNull();
  });

  it("offers one real repository connection action when no repository is observed", async () => {
    const port = gitOpsPort();
    vi.mocked(port.listApplications).mockResolvedValue([]);
    vi.mocked(port.listSyncTargets).mockResolvedValue([]);
    renderView(port);

    expect(await screen.findByText("No deployment targets")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect repository" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New deployment target" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  it("keeps server-owned refresh cadence without a browser fallback interval", async () => {
    vi.useFakeTimers();
    const port = gitOpsPort();
    vi.mocked(port.listApplications).mockResolvedValue([]);
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
  });
});

function renderView(
  port: ReturnType<typeof gitOpsPort>,
  refreshPolicies = gitOpsRefreshPolicies(),
) {
  return render(
    <MemoryRouter>
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <GitOpsSyncTableView port={port} refreshPolicies={refreshPolicies} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

function application(id: string, name: string, repository: string): ReleaseApplication {
  return {
    branch: "main",
    clusterId: "production",
    id,
    manifestPath: `deploy/${id}.yaml`,
    name,
    repository,
  };
}

function target(
  applicationId: string,
  applicationName: string,
  syncStatus: string,
  revision: string,
): GitOpsSyncTarget {
  return {
    applicationId,
    applicationName,
    clusterId: "production",
    environment: "production",
    id: `${applicationId}:production`,
    namespace: applicationId,
    observedAt: "2026-07-20T01:02:03Z",
    provider: "argo",
    revision,
    syncStatus,
  };
}
