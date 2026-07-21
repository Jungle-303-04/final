// @vitest-environment jsdom

import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsFailure } from "./applicationsContract";
import {
  APPLICATION_CARD,
  APPLICATION_DETAIL,
  applicationsPort,
  renderApplications,
} from "./ApplicationsSurface.testSupport";
import type { ApplicationCardModel, ApplicationsPort } from "./applicationsContract";

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

  it("keeps the last catalog result visible while a manual refresh reports real progress", async () => {
    const user = userEvent.setup();
    const replacement = deferred<readonly ApplicationCardModel[]>();
    const listApplications = vi.fn<ApplicationsPort["listApplications"]>()
      .mockResolvedValueOnce([APPLICATION_CARD])
      .mockReturnValueOnce(replacement.promise);
    const port = applicationsPort({ listApplications });
    const view = renderApplications(port);

    expect(await screen.findByText("checkout-api")).toBeTruthy();
    const refresh = screen.getByRole("button", { name: "Refresh" });
    const refreshedName = "checkout-api refreshed";

    await user.click(refresh);

    expect(listApplications).toHaveBeenCalledTimes(2);
    expect((refresh as HTMLButtonElement).disabled).toBe(true);
    expect(view.container.querySelector('[data-slot="product-page-frame"]')?.getAttribute("aria-busy"))
      .toBe("true");
    expect(view.container.querySelector('[data-slot="refresh-action-feedback"]')?.textContent)
      .toBe("Refreshing applications.");
    expect(refresh.querySelector('[data-slot="refresh-feedback"]')?.getAttribute("data-refresh-feedback-state"))
      .toBe("pending");
    expect(screen.getByText("checkout-api")).toBeTruthy();

    await user.click(refresh);
    expect(listApplications).toHaveBeenCalledTimes(2);

    await act(async () => {
      replacement.resolve([{ ...APPLICATION_CARD, name: refreshedName }]);
    });

    expect(await screen.findByText(refreshedName)).toBeTruthy();
    expect((refresh as HTMLButtonElement).disabled).toBe(false);
    expect(view.container.querySelector('[data-slot="product-page-frame"]')?.getAttribute("aria-busy"))
      .toBe("false");
    expect(view.container.querySelector('[data-slot="refresh-action-feedback"]')?.textContent)
      .toBe("Applications refreshed.");
  });

  it("keeps successful catalog data after a background refresh failure and aborts it on unmount", async () => {
    const user = userEvent.setup();
    const replacement = deferred<readonly ApplicationCardModel[]>();
    let refreshSignal: AbortSignal | undefined;
    const listApplications = vi.fn<ApplicationsPort["listApplications"]>()
      .mockResolvedValueOnce([APPLICATION_CARD])
      .mockImplementationOnce((_filter, signal) => {
        refreshSignal = signal;
        return replacement.promise;
      });
    const port = applicationsPort({ listApplications });
    const view = renderApplications(port);

    expect(await screen.findByText("checkout-api")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refreshSignal?.aborted).toBe(false);

    await act(async () => {
      replacement.reject(new ApplicationsFailure("offline"));
    });

    const failure = await screen.findByRole("alert");
    expect(failure.textContent).toBe("Could not refresh applications. Showing the last successful result.");
    expect(failure.textContent).not.toContain("offline");
    expect(screen.getByText("checkout-api")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(false);
    expect(view.container.querySelector('[data-slot="product-page-frame"]')?.getAttribute("aria-busy"))
      .toBe("false");

    const pending = deferred<readonly ApplicationCardModel[]>();
    listApplications.mockImplementationOnce((_filter, signal) => {
      refreshSignal = signal;
      return pending.promise;
    });
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    view.unmount();
    await Promise.resolve();
    expect(refreshSignal?.aborted).toBe(true);
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
    expect(await screen.findByRole("option", { name: /stage.*Connection delayed/i })).toBeTruthy();
    await user.click(await screen.findByRole("option", { name: /prod.*Live connection/i }));
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

  it("switches to server-selected workload evidence without rendering application delivery or action tabs", async () => {
    const workload = {
      key: "workload-a",
      resource: {
        apiGroup: "apps",
        version: "v1",
        kind: "Deployment",
        namespace: "prod",
        name: "checkout",
        uid: "deployment-uid",
      },
      scope: {
        workspaceId: "workspace-a",
        clusterId: "cluster-1",
        namespaces: ["prod"],
        freshness: "live" as const,
      },
      observedAt: "2026-07-14T09:00:00+00:00",
    };
    const workloadDetail = {
      ...APPLICATION_DETAIL,
      scope: {
        ...APPLICATION_DETAIL.scope,
        selectedScope: "workload" as const,
        workloadScope: {
          availability: "available" as const,
          completeness: "exact" as const,
          applicationScopeAvailable: false,
          selectedWorkloadKey: "workload-a",
          workloads: [workload],
          partialReasonCodes: [],
        },
      },
      workload: {
        workload,
        runtimeReadiness: {
          completeness: "exact" as const,
          status: "healthy" as const,
          readyPods: 1,
          totalPods: 1,
          restarts: 0,
        },
        resourceCounts: [{ kind: "Deployment", count: 1 }, { kind: "Pod", count: 1 }],
        resourceCountsCompleteness: "exact" as const,
        topology: APPLICATION_DETAIL.topology,
        history: { availability: "unavailable" as const, reasonCodes: ["workload_history_link_not_persisted"] },
        cost: { availability: "unavailable" as const, reasonCodes: ["cost_observation_not_integrated"] },
        actions: { availability: "unavailable" as const, reasonCodes: ["workload_action_capabilities_not_connected"] },
      },
    };
    const getApplication = vi.fn().mockImplementation((
      _applicationId: string,
      _signal: AbortSignal,
      _instanceId?: string | null,
      workloadKey?: string | null,
    ) => Promise.resolve(workloadKey === "workload-a" ? workloadDetail : APPLICATION_DETAIL));
    const port = applicationsPort({ getApplication });
    renderApplications(port, "/applications?app=app-checkout&instance=binding-prod&workload=workload-a&tab=overview");

    expect(await screen.findByTestId("application-workload-runtime")).toBeTruthy();
    expect(getApplication).toHaveBeenCalledWith(
      "app-checkout",
      expect.any(AbortSignal),
      "binding-prod",
      "workload-a",
    );
    const tabs = screen.getByRole("tablist", { name: "View details" });
    expect(within(tabs).getAllByRole("tab")).toHaveLength(3);
    expect(within(tabs).queryByRole("tab", { name: "Deployments" })).toBeNull();
    expect(screen.queryByText("v2.4.1 deployed")).toBeNull();

    await userEvent.setup().click(within(tabs).getByRole("tab", { name: "History" }));
    expect(await screen.findByTestId("application-workload-unavailable-evidence")).toBeTruthy();
    expect(screen.getByText("Workload-specific history is not connected yet.")).toBeTruthy();
    expect(screen.queryByText("workload_history_link_not_persisted")).toBeNull();
  });

  it("canonicalizes an unavailable opaque workload without disclosing it", async () => {
    const missing = "old-workload-key";
    const unavailableDetail = {
      ...APPLICATION_DETAIL,
      scope: {
        ...APPLICATION_DETAIL.scope,
        workloadScope: {
          availability: "available" as const,
          completeness: "partial" as const,
          applicationScopeAvailable: true,
          selectedWorkloadKey: null,
          workloads: [],
          partialReasonCodes: ["requested_workload_unavailable"],
        },
      },
    };
    const port = applicationsPort({ getApplication: vi.fn().mockResolvedValue(unavailableDetail) });
    renderApplications(port, `/applications?app=app-checkout&workload=${missing}&tab=overview`);

    await screen.findByText("v2.4.1 deployed");
    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toContain("workload="));
    expect(screen.queryByText(missing)).toBeNull();
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

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
