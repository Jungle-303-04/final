// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { BottomDockProvider } from "../../features/bottom-dock/BottomDockProvider";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type { RcaContextPort } from "../../features/issues/rcaContextContract";
import type { LogStreamPort } from "../../features/log-stream/logStreamContract";
import type { WorkloadDetail, WorkloadDetailPort } from "../../features/workload-detail/workloadDetailContract";
import { I18nProvider } from "../../shared/i18n";
import { WorkloadDetailRoute } from "./WorkloadDetailRoute";

describe("WorkloadDetailRoute", () => {
  it("uses the URL identity and opens the existing workload SSE stream only when available", async () => {
    const user = userEvent.setup();
    const open = vi.fn(() => () => undefined);
    renderRoute({
      getDetail: async () => detail(),
      getScheduledRuns: vi.fn(),
    }, { open });

    expect(await screen.findByText("Live logs")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Open live log stream" }));

    await waitFor(() => expect(open).toHaveBeenCalledWith({
      type: "workload",
      clusterId: "cluster-a",
      kind: "deployments",
      namespace: "shop",
      name: "checkout",
    }, expect.any(Object)));
  });

  it("renders product-owned workload copy in Korean", async () => {
    renderRoute({
      getDetail: async () => detail(),
      getScheduledRuns: vi.fn(),
    }, { open: vi.fn(() => () => undefined) }, "ko-KR");

    expect(await screen.findByText("실시간 로그")).toBeTruthy();
    expect(screen.getByRole("button", { name: "실시간 로그 스트림 열기" })).toBeTruthy();
    expect(screen.getByLabelText("워크로드 상세 섹션")).toBeTruthy();
  });

  it("connects the Events tab to the exact workload RCA context", async () => {
    const load = vi.fn().mockResolvedValue(rcaContextResult());
    renderRoute(
      { getDetail: async () => detail(), getScheduledRuns: vi.fn() },
      { open: vi.fn(() => () => undefined) },
      "en-US",
      "/workload/Deployment/shop/checkout?cluster=cluster-a&apiGroup=apps&apiVersion=v1&tab=events",
      { load },
    );

    expect(await screen.findByText("checkout requests failed")).toBeTruthy();
    expect(load).toHaveBeenCalledWith(expect.objectContaining({
      kind: "resource",
      scope: detail().scope,
      resource: detail().observation.resource,
    }), expect.any(AbortSignal));
  });
});

function renderRoute(
  port: WorkloadDetailPort,
  logStreamPort: LogStreamPort,
  navigatorLanguage = "en-US",
  initialEntry = "/workload/Deployment/shop/checkout?cluster=cluster-a&apiGroup=apps&apiVersion=v1&tab=logs",
  rcaContextPort?: RcaContextPort,
) {
  return render(
    <I18nProvider navigatorLanguage={navigatorLanguage} storage={null}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
          <BottomDockProvider port={logStreamPort}>
            <UnifiedFilterProvider>
              <Routes>
                <Route element={<WorkloadDetailRoute port={port} rcaContextPort={rcaContextPort} />} path="/workload/:kind/:namespace/:name" />
              </Routes>
            </UnifiedFilterProvider>
          </BottomDockProvider>
        </AuthSessionGateProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function rcaContextResult() {
  return {
    state: "available" as const,
    scope: detail().scope,
    coverageAvailability: "available" as const,
    reasonCodes: [],
    record: {
      issue: {
        id: "workspace-a:correlation-a",
        incidentId: "incident-a",
        correlationId: "correlation-a",
        workspaceId: "workspace-a",
        clusterId: "cluster-a",
        namespace: "shop",
        resourceKind: "Deployment",
        resourceName: "checkout",
        symptom: "unavailable replicas",
        currentSubject: "rca.completed",
        status: "rca_completed",
        rootCause: "memory limit exceeded",
        confidence: 0.95,
        supportingEvidence: ["container terminated"],
        missingEvidence: [],
        evidenceRef: "evidence://bundle",
        actionRoute: null,
        commandId: null,
        pullRequestUrl: null,
        errorReason: null,
        updatedAt: "2026-07-18T01:00:00Z",
      },
      report: null,
      rootCause: "memory limit exceeded",
      impact: "checkout requests failed",
      evidence: ["container terminated"],
      missingEvidence: [],
    },
  };
}

function detail(): WorkloadDetail {
  const resource = {
    apiGroup: "apps",
    version: "v1",
    kind: "Deployment",
    namespace: "shop",
    name: "checkout",
    uid: "workload-uid",
  };
  return {
    scope: { workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: ["shop"], freshness: "live" },
    observation: {
      resource,
      health: "healthy",
      replicas: { desired: 3, ready: 3, available: 3, updated: 3, unavailable: 0 },
      labels: [],
      observedAt: "2026-07-16T09:00:00Z",
    },
    coverage: {
      availability: "available",
      observationSnapshotId: "snapshot-a",
      latestSnapshotId: "snapshot-a",
      observedAt: "2026-07-16T09:00:00Z",
      reasonCodes: [],
    },
    pods: { availability: "partial", items: [], excludedCount: 0, reasonCodes: ["direct_pod_relationship_is_bounded"] },
    events: { availability: "partial", items: [], excludedCount: 0, reasonCodes: ["direct_event_relationship_is_bounded"] },
    logStream: { availability: "available", streamKind: "deployments", reasonCodes: [] },
    rightsizing: {
      availability: "unavailable",
      reasonCodes: ["rightsizing_observation_not_integrated"],
    },
    capabilities: { revision: "snapshot-a", actions: [] },
    features: [
      { name: "overview", availability: "available", reasonCodes: [] },
      { name: "pods", availability: "partial", reasonCodes: ["direct_pod_relationship_is_bounded"] },
      { name: "events", availability: "partial", reasonCodes: ["direct_event_relationship_is_bounded"] },
      { name: "logs", availability: "available", reasonCodes: [] },
      { name: "rightsizing", availability: "unavailable", reasonCodes: ["rightsizing_observation_not_integrated"] },
    ],
  };
}
