// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import {
  ProductNotificationsProvider,
  useProductNotifications,
} from "../../features/notifications/ProductNotificationsProvider";
import { I18nProvider } from "../../shared/i18n";
import { GitOpsSyncTableView } from "./GitOpsSyncTableView";
import { gitOpsPort, gitOpsRefreshPolicies } from "./GitOpsPage.testSupport";

afterEach(cleanup);

describe("repository reflection gate", () => {
  it("keeps the modal in an error state when the connected row cannot be reflected", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    let connected = false;
    vi.mocked(port.connectApplication).mockImplementation(async () => {
      connected = true;
      return {
        id: "inventory-api",
        name: "Inventory API",
        repository: "team/inventory-api",
        branch: "main",
        clusterId: "production-cluster",
        manifestPath: "deploy.yaml",
      };
    });
    vi.mocked(port.listSyncTargets).mockImplementation(() => (
      connected
        ? Promise.reject(new Error("overview unavailable"))
        : Promise.resolve([])
    ));
    render(
      <MemoryRouter>
        <I18nProvider navigatorLanguage="en-US" storage={null}>
          <ProductNotificationsProvider>
            <GitOpsSyncTableView
              port={port}
              refreshPolicies={gitOpsRefreshPolicies()}
            />
            <NotificationProbe />
          </ProductNotificationsProvider>
        </I18nProvider>
      </MemoryRouter>,
    );

    await screen.findByText("team/checkout-api");
    await user.click(screen.getByRole("button", { name: "Connect repository" }));
    const dialog = screen.getByRole("dialog", { name: "Connect Git repository" });
    await user.type(within(dialog).getByLabelText("Target name"), "Inventory API");
    await user.type(within(dialog).getByLabelText("Git repository"), "team/inventory-api");
    await user.click(within(dialog).getByRole("button", { name: "Connect repository" }));

    expect(await within(dialog).findByText(
      /The repository could not be connected\./u,
    )).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Connect Git repository" })).toBeTruthy();
    expect(screen.queryByText("Inventory API")).toBeNull();
    expect(screen.getByTestId("notification-probe").textContent).toBe("");
    expect(dialog.querySelector("[data-stage='status']")?.getAttribute("data-state"))
      .toBe("error");
  });

  it("rejects a contradictory ready stage unless persisted status is active", async () => {
    const user = userEvent.setup();
    const port = gitOpsPort();
    vi.mocked(port.getRepositoryConnectionStatus).mockResolvedValue({
      repoRef: "team/inventory-api",
      repositoryId: "repo-inventory-api",
      repositoryStatus: "disabled",
      connectionStage: "ready",
      terminal: true,
      refreshAfterSeconds: null,
    });
    vi.mocked(port.listSyncTargets)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "inventory-api:production-cluster",
        applicationId: "inventory-api",
        applicationName: "Inventory API",
        clusterId: "production-cluster",
        namespace: "default",
        environment: "development",
        syncStatus: null,
        revision: null,
        observedAt: null,
      }]);
    renderView(port);

    await screen.findByText("team/checkout-api");
    await user.click(screen.getByRole("button", { name: "Connect repository" }));
    const dialog = screen.getByRole("dialog", { name: "Connect Git repository" });
    await user.type(within(dialog).getByLabelText("Target name"), "Inventory API");
    await user.type(within(dialog).getByLabelText("Git repository"), "team/inventory-api");
    await user.click(within(dialog).getByRole("button", { name: "Connect repository" }));

    expect(await within(dialog).findByText(
      /The repository could not be connected\./u,
    )).toBeTruthy();
    expect(port.listSyncTargets).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("notification-probe").textContent).toBe("");
  });
});

function renderView(port: ReturnType<typeof gitOpsPort>) {
  return render(
    <MemoryRouter>
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ProductNotificationsProvider>
          <GitOpsSyncTableView port={port} refreshPolicies={gitOpsRefreshPolicies()} />
          <NotificationProbe />
        </ProductNotificationsProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

function NotificationProbe() {
  const { notifications } = useProductNotifications();
  return <output data-testid="notification-probe">{notifications[0]?.id ?? ""}</output>;
}
