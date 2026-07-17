// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { UnifiedFilterProvider, useUnifiedFilter } from "../filters/UnifiedFilterProvider";
import { ApplicationDetailWorkspace } from "./ApplicationDetailWorkspace";
import {
  APPLICATION_DETAIL,
  applicationsPort,
} from "./ApplicationsSurface.testSupport";
import type {
  ApplicationDetailModel,
  ApplicationWorkloadScopeItem,
  ApplicationsPort,
} from "./applicationsContract";

const WORKLOAD = {
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
    freshness: "live",
  },
  observedAt: "2026-07-14T09:00:00+00:00",
} satisfies ApplicationWorkloadScopeItem;

const APPLICATION_WITH_WORKLOAD_SCOPE = {
  ...APPLICATION_DETAIL,
  scope: {
    ...APPLICATION_DETAIL.scope,
    selectedScope: "application",
    workloadScope: {
      availability: "available",
      completeness: "exact",
      applicationScopeAvailable: true,
      selectedWorkloadKey: null,
      workloads: [WORKLOAD],
      partialReasonCodes: [],
    },
  },
} satisfies ApplicationDetailModel;

const WORKLOAD_DETAIL = {
  ...APPLICATION_WITH_WORKLOAD_SCOPE,
  scope: {
    ...APPLICATION_WITH_WORKLOAD_SCOPE.scope,
    selectedScope: "workload",
    workloadScope: {
      ...APPLICATION_WITH_WORKLOAD_SCOPE.scope.workloadScope,
      selectedWorkloadKey: WORKLOAD.key,
    },
  },
  workload: {
    workload: WORKLOAD,
    runtimeReadiness: {
      completeness: "exact",
      status: "healthy",
      readyPods: 1,
      totalPods: 1,
      restarts: 0,
    },
    resourceCounts: [{ kind: "Deployment", count: 1 }, { kind: "Pod", count: 1 }],
    resourceCountsCompleteness: "exact",
    topology: APPLICATION_DETAIL.topology,
    history: { availability: "unavailable", reasonCodes: ["workload_history_link_not_persisted"] },
    cost: { availability: "unavailable", reasonCodes: ["cost_observation_not_integrated"] },
    actions: { availability: "unavailable", reasonCodes: ["workload_action_capabilities_not_connected"] },
  },
} satisfies ApplicationDetailModel;

afterEach(cleanup);

describe("ApplicationDetailWorkspace workload scope", () => {
  it("switches between application and opaque workload scopes without mixing their tabs or data", async () => {
    const user = userEvent.setup();
    const getApplication = vi.fn().mockImplementation((
      _applicationId: string,
      _signal: AbortSignal,
      _instanceId?: string | null,
      workloadKey?: string | null,
    ) => Promise.resolve(workloadKey === WORKLOAD.key ? WORKLOAD_DETAIL : APPLICATION_WITH_WORKLOAD_SCOPE));
    const port = applicationsPort({ getApplication });
    renderWorkspace(port, "/applications?app=app-checkout&instance=binding-prod&tab=history");

    expect(await screen.findByText("v2.4.1 deployed")).toBeTruthy();
    const applicationTabs = screen.getByRole("tablist", { name: "View details" });
    expect(within(applicationTabs).getAllByRole("tab")).toHaveLength(7);

    await user.click(screen.getByRole("combobox", { name: "Workload scope" }));
    await user.click(await screen.findByRole("option", { name: /Deployment\/checkout/ }));

    await waitFor(() => expect(screen.getByTestId("location").textContent)
      .toContain("workload=workload-a"));
    await waitFor(() => expect(screen.getByTestId("location").textContent)
      .toContain("tab=overview"));
    expect(await screen.findByTestId("application-workload-runtime")).toBeTruthy();
    expect(getApplication).toHaveBeenCalledWith(
      "app-checkout",
      expect.any(AbortSignal),
      "binding-prod",
      "workload-a",
    );
    const workloadTabs = screen.getByRole("tablist", { name: "View details" });
    expect(within(workloadTabs).getAllByRole("tab")).toHaveLength(3);
    expect(within(workloadTabs).queryByRole("tab", { name: "Deployments" })).toBeNull();
    expect(screen.queryByText("v2.4.1 deployed")).toBeNull();

    await user.click(screen.getByRole("combobox", { name: "Workload scope" }));
    await user.click(await screen.findByRole("option", { name: "Application" }));

    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toContain("workload="));
    expect(await screen.findByText("v2.4.1 deployed")).toBeTruthy();
    expect(within(screen.getByRole("tablist", { name: "View details" })).getAllByRole("tab")).toHaveLength(7);
  });

  it("canonicalizes an invalid workload key without rendering it or its internal recovery reason", async () => {
    const invalidKey = "opaque-workload-no-longer-authorized";
    const product = {
      ...APPLICATION_DETAIL,
      scope: {
        ...APPLICATION_DETAIL.scope,
        workloadScope: {
          availability: "available",
          completeness: "partial",
          applicationScopeAvailable: true,
          selectedWorkloadKey: null,
          workloads: [],
          partialReasonCodes: ["requested_workload_unavailable"],
        },
      },
    } satisfies ApplicationDetailModel;
    const getApplication = vi.fn().mockResolvedValue(product);
    renderWorkspace(applicationsPort({ getApplication }), `/applications?app=app-checkout&workload=${invalidKey}&tab=overview`);

    expect(await screen.findByText("v2.4.1 deployed")).toBeTruthy();
    expect(getApplication).toHaveBeenCalledWith("app-checkout", expect.any(AbortSignal), undefined, invalidKey);
    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toContain("workload="));
    expect(screen.queryByText(invalidKey)).toBeNull();
    expect(screen.queryByText("requested_workload_unavailable")).toBeNull();
  });

  it("does not fabricate a workload picker or recover an opaque key while workload scope evidence is unavailable", async () => {
    const unavailableScope = {
      ...APPLICATION_DETAIL,
      scope: {
        ...APPLICATION_DETAIL.scope,
        workloadScope: {
          availability: "unavailable",
          completeness: "unavailable",
          applicationScopeAvailable: false,
          selectedWorkloadKey: null,
          workloads: [],
          partialReasonCodes: ["inventory_snapshot_unavailable"],
        },
      },
    } satisfies ApplicationDetailModel;
    const port = applicationsPort({ getApplication: vi.fn().mockResolvedValue(unavailableScope) });
    renderWorkspace(port, "/applications?app=app-checkout&workload=opaque-pending-evidence&tab=overview");

    expect(await screen.findByText("v2.4.1 deployed")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Workload scope" })).toBeNull();
    expect(screen.getByTestId("location").textContent).toContain("workload=opaque-pending-evidence");
    expect(screen.queryByText("inventory_snapshot_unavailable")).toBeNull();
  });
});

function renderWorkspace(port: ApplicationsPort, initialEntry: string) {
  const router = createMemoryRouter([
    {
      path: "/applications/*",
      element: (
        <I18nProvider navigatorLanguage="en-US" storage={null}>
          <UnifiedFilterProvider>
            <WorkspaceHarness port={port} />
            <LocationProbe />
          </UnifiedFilterProvider>
        </I18nProvider>
      ),
    },
  ], { initialEntries: [initialEntry] });
  return render(<RouterProvider router={router} />);
}

function WorkspaceHarness({ port }: { port: ApplicationsPort }) {
  const filter = useUnifiedFilter();
  return <ApplicationDetailWorkspace applicationId="app-checkout" filter={filter} port={port} />;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}
