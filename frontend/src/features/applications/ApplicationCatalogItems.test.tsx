// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { ApplicationsTable } from "./ApplicationsTable";
import type { ApplicationCardModel } from "./applicationsContract";

afterEach(cleanup);

describe("application catalog items", () => {
  it("uses the six-column demo grammar and keeps every operational channel in expandable evidence", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderUi(
      <ApplicationsTable
        applications={[
          application,
          {
            ...application,
            id: "app-worker",
            name: "worker",
            health: { ...application.health, readyPods: null, totalPods: null },
            runtimeReadiness: {
              completeness: "unavailable",
              status: "unknown",
              readyPods: null,
              totalPods: null,
              restarts: null,
            },
            currentDeployment: null,
            hasDrift: null,
            driftSummary: null,
            openIncidents: null,
          },
        ]}
        onOpen={onOpen}
      />,
    );

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Application",
      "Environment",
      "Sync status",
      "Health",
      "Ready pods",
      "Revision",
    ]);

    const checkoutRow = screen.getByRole("row", { name: /checkout-api/i });
    expect(within(checkoutRow).getByText("prod")).toBeTruthy();
    expect(within(checkoutRow).getByText("OutOfSync")).toBeTruthy();
    expect(within(checkoutRow).getByText("degraded")).toBeTruthy();
    expect(within(checkoutRow).getByText("2/3")).toBeTruthy();
    expect(within(checkoutRow).getByText("a3f9c2e")).toBeTruthy();

    await user.click(within(checkoutRow).getByRole("button", { name: "View details: checkout-api" }));
    const checkoutEvidence = screen.getByRole("region", { name: "checkout-api View details" });
    const ready = within(checkoutEvidence).getByTestId("application-ready-bar");
    expect(ready.textContent).toContain("2/3");
    expect(within(ready).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    expect(within(checkoutEvidence).getByText("v2.4.1")).toBeTruthy();
    expect(within(checkoutEvidence).getByText("a3f9c2e")).toBeTruthy();
    expect(within(checkoutEvidence).getByTestId("application-delivery-state-channel").textContent)
      .toContain("Failed");
    expect(within(checkoutEvidence).getByTestId("application-batch-runtime-channel").textContent)
      .toContain("active 1");
    expect(within(checkoutEvidence).getByTestId("application-drift-channel")).toBeTruthy();
    expect(within(checkoutEvidence).getByTestId("application-incident-channel")).toBeTruthy();
    expect(within(checkoutEvidence).getByText("opsia/checkout · main · deploy/prod")).toBeTruthy();

    await user.click(within(checkoutRow).getByRole("button", { name: "View details" }));
    expect(onOpen).toHaveBeenCalledWith("app-checkout");

    const workerRow = screen.getByRole("row", { name: /worker/i });
    expect(within(workerRow).queryByRole("progressbar")).toBeNull();
    await user.click(within(workerRow).getByRole("button", { name: "View details: worker" }));
    const workerEvidence = screen.getByRole("region", { name: "worker View details" });
    expect(within(workerEvidence).queryByRole("progressbar")).toBeNull();
    expect(within(workerEvidence).getByTestId("application-ready-bar").textContent).toContain("Unavailable");
  });
});

const application: ApplicationCardModel = {
  id: "app-checkout",
  name: "checkout-api",
  environments: ["prod"],
  lifecycleStatus: "active",
  health: { status: "degraded", readyPods: 2, totalPods: 3, restarts: 4 },
  runtimeReadiness: {
    completeness: "exact",
    status: "degraded",
    readyPods: 2,
    totalPods: 3,
    restarts: 4,
  },
  currentDeployment: {
    version: "v2.4.1",
    image: "registry/checkout:v2.4.1",
    imageDigest: "sha256:abc",
    gitSha: "a3f9c2e0123",
    deployedAt: "2026-07-14T09:00:00+00:00",
    deployedBy: "operator",
  },
  delivery: {
    availability: "available",
    status: "failed",
    workflowRunId: "run-2",
    observedAt: "2026-07-14T10:00:00+00:00",
  },
  batchRuntime: {
    availability: "available",
    completeness: "exact",
    status: "running",
    activeRuns: 1,
    failedRuns: 0,
    succeededRuns: 2,
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
