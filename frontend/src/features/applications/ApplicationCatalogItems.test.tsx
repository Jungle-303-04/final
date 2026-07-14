// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { ApplicationCard } from "./ApplicationCard";
import { ApplicationsTable } from "./ApplicationsTable";
import type { ApplicationCardModel } from "./applicationsContract";

afterEach(cleanup);

describe("application catalog items", () => {
  it("separates readiness, deployment, drift, and incident evidence on a card", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderUi(<ApplicationCard application={application} onOpen={onOpen} />);

    const ready = screen.getByTestId("application-ready-bar");
    expect(ready).toHaveTextContent("2/3");
    expect(within(ready).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(within(ready).getByRole("progressbar")).toHaveStyle({ width: "67%" });

    const deployment = screen.getByTestId("application-deployment-channel");
    expect(within(deployment).getByText("v2.4.1")).toBeTruthy();
    expect(within(deployment).getByText("a3f9c2e")).toBeTruthy();

    expect(screen.getByTestId("application-drift-channel")).toHaveTextContent("spec.replicas differs");
    expect(screen.getByTestId("application-incident-channel")).toHaveTextContent("Open incidents 1");

    await user.click(screen.getByRole("button", { name: /checkout-api/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("keeps version and SHA distinct in the table and never invents absent readiness", () => {
    renderUi(
      <ApplicationsTable
        applications={[
          application,
          {
            ...application,
            id: "app-worker",
            name: "worker",
            health: { ...application.health, readyPods: null, totalPods: null },
            currentDeployment: null,
            hasDrift: null,
            driftSummary: null,
            openIncidents: null,
          },
        ]}
        onOpen={vi.fn()}
      />,
    );

    const checkoutRow = screen.getByRole("row", { name: /checkout-api/i });
    expect(within(checkoutRow).getByText("v2.4.1")).toBeTruthy();
    expect(within(checkoutRow).getByText("a3f9c2e")).toBeTruthy();
    expect(within(checkoutRow).getByTestId("application-drift-channel")).toBeTruthy();
    expect(within(checkoutRow).getByTestId("application-incident-channel")).toBeTruthy();

    const workerRow = screen.getByRole("row", { name: /worker/i });
    expect(within(workerRow).queryByRole("progressbar")).toBeNull();
    expect(within(workerRow).getByText("Unavailable")).toBeTruthy();
  });
});

const application: ApplicationCardModel = {
  id: "app-checkout",
  name: "checkout-api",
  environments: ["prod"],
  lifecycleStatus: "active",
  health: { status: "degraded", readyPods: 2, totalPods: 3, restarts: 4 },
  currentDeployment: {
    version: "v2.4.1",
    image: "registry/checkout:v2.4.1",
    imageDigest: "sha256:abc",
    gitSha: "a3f9c2e0123",
    deployedAt: "2026-07-14T09:00:00+00:00",
    deployedBy: "operator",
  },
  hasDrift: true,
  driftSummary: "spec.replicas differs",
  resourceCounts: [{ kind: "Deployment", count: 1 }, { kind: "Service", count: 1 }],
  resourceCountsCompleteness: "exact",
  openIncidents: 1,
  repositoryRef: "opsia/checkout",
  defaultBranch: "main",
  manifestPath: "deploy/prod",
};

function renderUi(children: React.ReactNode) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      {children}
    </I18nProvider>,
  );
}
