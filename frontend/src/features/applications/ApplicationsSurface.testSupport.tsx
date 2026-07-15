import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { UnifiedFilterProvider } from "../filters/UnifiedFilterProvider";
import { ApplicationsSurface } from "./ApplicationsSurface";
import type {
  ApplicationCardModel,
  ApplicationDetailModel,
  ApplicationsPort,
} from "./applicationsContract";

export const APPLICATION_CARD: ApplicationCardModel = {
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
    status: "succeeded",
    workflowRunId: "run-1",
    observedAt: "2026-07-14T09:00:00+00:00",
  },
  batchRuntime: {
    availability: "unavailable",
    completeness: "unavailable",
    status: null,
    activeRuns: null,
    failedRuns: null,
    succeededRuns: null,
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

export const APPLICATION_DETAIL: ApplicationDetailModel = {
  ...APPLICATION_CARD,
  endpoints: [{ id: "ingress:checkout", kind: "Ingress", name: "checkout", address: "https://checkout.test" }],
  endpointsCompleteness: "exact",
  recentActivity: [{
    id: "activity-1",
    type: "deployment",
    summary: "v2.4.1 deployed",
    occurredAt: "2026-07-14T09:00:00+00:00",
  }],
  recentIncidents: [{
    id: "incident-1",
    title: "Checkout latency",
    status: "open",
    startedAt: "2026-07-14T09:10:00+00:00",
  }],
};

export function applicationsPort(overrides: Partial<ApplicationsPort> = {}): ApplicationsPort {
  return {
    listApplications: vi.fn().mockResolvedValue([APPLICATION_CARD]),
    getApplication: vi.fn().mockResolvedValue(APPLICATION_DETAIL),
    listDeployments: vi.fn().mockResolvedValue([{
      id: "deployment-1",
      environment: "prod",
      clusterId: "cluster-1",
      gitSha: "a3f9c2e0123",
      version: "v2.4.1",
      deployedAt: "2026-07-14T09:00:00+00:00",
      deployedBy: "operator",
      status: "succeeded",
      gitOpsChangeId: "change-42",
    }]),
    getDrift: vi.fn().mockResolvedValue({
      status: "drifted",
      summary: "one field differs",
      differences: [{
        resource: "Deployment/checkout",
        fieldPath: "spec.replicas",
        oldValue: 3,
        newValue: 1,
        valueRedacted: false,
        changedBy: "operator",
        changedAt: "2026-07-14T09:10:00+00:00",
      }],
      observedAt: "2026-07-14T09:11:00+00:00",
    }),
    ...overrides,
  };
}

export function renderApplications(
  port: ApplicationsPort,
  initialEntry = "/applications",
) {
  const router = createMemoryRouter([{
    path: "/applications/*",
    element: (
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <UnifiedFilterProvider>
          <ApplicationsSurface port={port} />
          <LocationProbe />
        </UnifiedFilterProvider>
      </I18nProvider>
    ),
  }], { initialEntries: [initialEntry] });
  return { ...render(<RouterProvider router={router} />), router };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}
