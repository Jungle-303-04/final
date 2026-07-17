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
  scope: {
    availability: "available",
    completeness: "exact",
    selectedInstanceId: "binding-prod",
    instances: [
      {
        id: "binding-prod",
        environment: "prod",
        status: "active",
        scope: {
          workspaceId: "workspace-a",
          clusterId: "cluster-1",
          namespaces: ["prod"],
          freshness: "live",
        },
      },
      {
        id: "binding-stage",
        environment: "stage",
        status: "active",
        scope: {
          workspaceId: "workspace-a",
          clusterId: "cluster-2",
          namespaces: ["stage"],
          freshness: "stale",
        },
      },
    ],
    partialReasonCodes: [],
    selectedScope: "application",
    workloadScope: {
      availability: "available",
      completeness: "exact",
      applicationScopeAvailable: true,
      selectedWorkloadKey: null,
      workloads: [],
      partialReasonCodes: [],
    },
  },
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
  topology: {
    availability: "available",
    completeness: "exact",
    observedAt: "2026-07-14T09:00:00+00:00",
    nodes: [
      {
        id: "deployment-1",
        clusterId: "cluster-1",
        resourceType: "workload",
        kind: "Deployment",
        namespace: "prod",
        name: "checkout",
        status: "Ready",
        health: "healthy",
        observedAt: "2026-07-14T09:00:00+00:00",
      },
      {
        id: "pod-1",
        clusterId: "cluster-1",
        resourceType: "pod",
        kind: "Pod",
        namespace: "prod",
        name: "checkout-1",
        status: "Running",
        health: "healthy",
        observedAt: "2026-07-14T09:00:00+00:00",
      },
    ],
    edges: [{
      id: "edge-1",
      fromId: "deployment-1",
      toId: "pod-1",
      type: "owns",
      evidenceType: "owner_reference",
      authority: "authoritative",
      observedAt: "2026-07-14T09:00:00+00:00",
    }],
    partialReasonCodes: [],
  },
  history: {
    availability: "available",
    completeness: "partial",
    entries: [{
      id: "delivery:run-1",
      type: "delivery",
      status: "succeeded",
      summary: "v2.4.1 deployed",
      occurredAt: "2026-07-14T09:00:00+00:00",
      workflowRunId: "run-1",
      gitOpsChangeId: "change-42",
    }],
    partialReasonCodes: ["bounded_workflow_history"],
  },
  source: {
    availability: "available",
    completeness: "exact",
    conflict: "aligned",
    repositoryRef: "opsia/checkout",
    defaultBranch: "main",
    manifestPath: "deploy/prod",
    partialReasonCodes: [],
  },
  workload: null,
};

export function applicationsPort(overrides: Partial<ApplicationsPort> = {}): ApplicationsPort {
  return {
    loadApplicationsRefreshPolicy: vi.fn().mockResolvedValue({
      staleAfterSeconds: 30,
      refreshAfterSeconds: 60,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    }),
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
  const router = createMemoryRouter([
    {
      path: "/applications/*",
      element: (
        <I18nProvider navigatorLanguage="en-US" storage={null}>
          <UnifiedFilterProvider>
            <ApplicationsSurface port={port} />
            <LocationProbe />
          </UnifiedFilterProvider>
        </I18nProvider>
      ),
    },
    { path: "/gitops", element: <LocationProbe /> },
  ], { initialEntries: [initialEntry] });
  return { ...render(<RouterProvider router={router} />), router };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}
