// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { GitOpsSyncTableView } from "./GitOpsSyncTableView";
import { gitOpsPort } from "./GitOpsPage.testSupport";

afterEach(cleanup);

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

  it("keeps the no-target state informative without offering an unavailable action", async () => {
    const port = gitOpsPort();
    vi.mocked(port.listSyncTargets).mockResolvedValue([]);
    renderView(port);

    expect(await screen.findByText("No deployment targets")).toBeTruthy();
    expect(screen.getByText("Register an application deployment target to see its sync status here.")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });
});

function renderView(port: ReturnType<typeof gitOpsPort>) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <GitOpsSyncTableView port={port} />
    </I18nProvider>,
  );
}
