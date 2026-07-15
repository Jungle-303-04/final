// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsFailure } from "./applicationsContract";
import {
  APPLICATION_CARD,
  APPLICATION_DETAIL,
  applicationsPort,
  renderApplications,
} from "./ApplicationsSurface.testSupport";

afterEach(cleanup);

describe("S10 Applications surface", () => {
  it("forwards the canonical unified filter state and switches the same result set to table view", async () => {
    const user = userEvent.setup();
    const port = applicationsPort();
    renderApplications(
      port,
      "/applications?clusters=cluster-1&namespaces=cluster-1%2Fprod&applications=app-checkout&labels=team%3Dcheckout&applications.environment=prod&applications.status=degraded&applications.pendingPromotion=true&applications.q=check",
    );

    expect(await screen.findByText("checkout-api")).toBeTruthy();
    expect(port.listApplications).toHaveBeenCalledWith({
      clusters: ["cluster-1"],
      namespaces: ["cluster-1/prod"],
      applications: ["app-checkout"],
      labels: ["team=checkout"],
      environments: ["prod"],
      statuses: ["degraded"],
      pendingPromotion: true,
      query: "check",
    }, expect.any(AbortSignal));
    expect(screen.queryByRole("textbox")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Table view" }));
    expect(screen.getByRole("region", { name: "Applications" })).toBeTruthy();
    expect(within(screen.getByRole("row", { name: /checkout-api/ })).getByText("checkout-api")).toBeTruthy();
  });

  it("routes an empty catalog to the real GitOps connection flow", async () => {
    const user = userEvent.setup();
    const port = applicationsPort({
      listApplications: vi.fn().mockResolvedValue([]),
    });
    renderApplications(port, "/applications?clusters=cluster-1");

    expect(await screen.findByText("No applications to show.")).toBeTruthy();
    const connectLink = screen.getByRole("link", { name: "Connect an application in GitOps" });
    expect(connectLink.tagName).toBe("A");
    expect(connectLink.getAttribute("href")).toBe("/gitops?clusters=cluster-1&mode=new");

    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(connectLink);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByTestId("location").textContent)
      .toBe("/gitops?clusters=cluster-1&mode=new"));
  });

  it("opens URL-backed detail and keeps overview evidence honest", async () => {
    const user = userEvent.setup();
    const port = applicationsPort();
    renderApplications(port, "/applications?clusters=cluster-1&labels=team%3Dcheckout");

    await user.click(await screen.findByRole("button", { name: /checkout-api/ }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toContain("app=app-checkout"));
    expect(screen.getByTestId("location").textContent).toContain("tab=overview");
    expect(await screen.findByText("v2.4.1 deployed")).toBeTruthy();
    expect(screen.getByText("https://checkout.test")).toBeTruthy();
    expect(port.getApplication).toHaveBeenCalledWith("app-checkout", expect.any(AbortSignal));
  });

  it("keeps the server-authorized deployment instance in the URL and scopes follow-up reads", async () => {
    const user = userEvent.setup();
    const getApplication = vi.fn().mockImplementation((
      _applicationId: string,
      _signal: AbortSignal,
      instanceId?: string | null,
    ) => Promise.resolve({
      ...APPLICATION_DETAIL,
      scope: {
        ...APPLICATION_DETAIL.scope,
        selectedInstanceId: instanceId ?? "binding-prod",
      },
    }));
    const port = applicationsPort({ getApplication });
    renderApplications(
      port,
      "/applications?app=app-checkout&tab=overview&instance=binding-stage",
    );

    expect(await screen.findByText("v2.4.1 deployed")).toBeTruthy();
    expect(getApplication).toHaveBeenCalledWith(
      "app-checkout",
      expect.any(AbortSignal),
      "binding-stage",
    );

    await user.click(screen.getByRole("combobox", { name: "Deployment instance scope" }));
    expect(screen.getByRole("option", { name: /stage.*Connection delayed/i })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: /prod.*Live connection/i }));
    await waitFor(() => expect(screen.getByTestId("location").textContent)
      .toContain("instance=binding-prod"));
    await waitFor(() => expect(getApplication).toHaveBeenCalledWith(
      "app-checkout",
      expect.any(AbortSignal),
      "binding-prod",
    ));

    await user.click(screen.getByRole("tab", { name: "Deployments" }));
    await waitFor(() => expect(port.listDeployments).toHaveBeenCalledWith(
      "app-checkout",
      expect.any(AbortSignal),
      "binding-prod",
    ));
  });

  it("renders topology, history, source evidence, counts-only drilldowns, deployment links, and semantic drift", async () => {
    const user = userEvent.setup();
    const port = applicationsPort();
    renderApplications(
      port,
      "/applications?clusters=cluster-1&labels=team%3Dcheckout&app=app-checkout&tab=overview",
    );
    await screen.findByText("v2.4.1 deployed");

    const tabs = screen.getByRole("tablist", { name: "View details" });
    expect(within(tabs).getAllByRole("tab")).toHaveLength(7);
    expect(screen.getByTestId("application-source-evidence").textContent).toContain("Aligned with cluster");

    await user.click(within(tabs).getByRole("tab", { name: "Topology" }));
    expect(await screen.findByTestId("application-topology-nodes")).toBeTruthy();
    expect(screen.getByText("Deployment/checkout")).toBeTruthy();
    expect(screen.getByTestId("application-topology-edges").textContent).toContain("owns");

    await user.click(within(tabs).getByRole("tab", { name: "History" }));
    expect(await screen.findByTestId("application-history-evidence")).toBeTruthy();
    expect(screen.getByTestId("application-history-evidence").textContent).toContain("v2.4.1 deployed");

    await user.click(within(tabs).getByRole("tab", { name: "Resources" }));
    const resourceLink = await screen.findByRole("link", { name: /View all in Resources/ });
    expect(resourceLink.getAttribute("href")).toBe(
      "/resources?clusters=cluster-1&applications=app-checkout&labels=team%3Dcheckout",
    );
    expect(screen.getByText("Deployment")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Name" })).toBeNull();

    await user.click(within(tabs).getByRole("tab", { name: "Deployments" }));
    const gitOpsLink = await screen.findByRole("link", { name: /View GitOps change/ });
    expect(gitOpsLink.getAttribute("href")).toBe(
      "/gitops?clusters=cluster-1&labels=team%3Dcheckout&detail=change%3Achange-42",
    );
    expect(port.listDeployments).toHaveBeenCalledWith(
      "app-checkout",
      expect.any(AbortSignal),
      "binding-prod",
    );

    await user.click(within(tabs).getByRole("tab", { name: "Drift" }));
    expect(await screen.findByText("spec.replicas")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();

    await user.click(within(tabs).getByRole("tab", { name: "Incidents" }));
    expect(await screen.findByText("Checkout latency")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View all in Issues/ }).getAttribute("href")).toBe(
      "/issues?clusters=cluster-1&applications=app-checkout&labels=team%3Dcheckout",
    );
  });

  it("does not synthesize absent counts, deployments, or drift", async () => {
    const user = userEvent.setup();
    const port = applicationsPort({
      listApplications: vi.fn().mockResolvedValue([{
        ...APPLICATION_CARD,
        currentDeployment: null,
        hasDrift: null,
        driftSummary: null,
        resourceCounts: null,
        resourceCountsCompleteness: "unavailable",
        openIncidents: null,
      }]),
      getApplication: vi.fn().mockResolvedValue({
        ...APPLICATION_DETAIL,
        resourceCounts: null,
        resourceCountsCompleteness: "unavailable",
        topology: {
          availability: "unavailable",
          completeness: "unavailable",
          observedAt: null,
          nodes: null,
          edges: null,
          partialReasonCodes: [],
        },
        history: {
          availability: "available",
          completeness: "partial",
          entries: [],
          partialReasonCodes: ["bounded_workflow_history"],
        },
      }),
      listDeployments: vi.fn().mockResolvedValue([]),
      getDrift: vi.fn().mockResolvedValue({
        status: "unknown", summary: null, differences: [], observedAt: null,
      }),
    });
    renderApplications(port);
    await user.click(await screen.findByRole("button", { name: /checkout-api/ }));
    await user.click(await screen.findByRole("tab", { name: "Deployments" }));
    expect(await screen.findByText("No deployment history is available.")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Drift" }));
    expect(await screen.findByText(/currently unavailable/)).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Topology" }));
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByText("No recent activity.")).toBeTruthy();
  });

  it("isolates unavailable product projection failures", async () => {
    const port = applicationsPort({
      listApplications: vi.fn().mockRejectedValue(new ApplicationsFailure("unavailable")),
    });
    renderApplications(port);
    expect(await screen.findByText(/Unable to read the verified response/i)).toBeTruthy();
    expect(screen.queryByText("checkout-api")).toBeNull();
  });
});
