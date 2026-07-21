// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { BottomDockProvider } from "../../features/bottom-dock/BottomDockProvider";
import type { LogStreamPort } from "../../features/log-stream/logStreamContract";
import type { WorkloadDetail, WorkloadDetailPort } from "../../features/workload-detail/workloadDetailContract";
import { WorkloadDetailRoute } from "./WorkloadDetailRoute";

describe("WorkloadDetailRoute", () => {
  it("uses the URL identity and opens the existing workload SSE stream only when available", async () => {
    const user = userEvent.setup();
    const open = vi.fn(() => () => undefined);
    renderRoute({
      getDetail: async () => detail(),
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
});

function renderRoute(port: WorkloadDetailPort, logStreamPort: LogStreamPort) {
  return render(
    <MemoryRouter initialEntries={[
      "/workload/Deployment/shop/checkout?cluster=cluster-a&apiGroup=apps&apiVersion=v1&tab=logs",
    ]}>
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        <BottomDockProvider port={logStreamPort}>
          <Routes>
            <Route element={<WorkloadDetailRoute port={port} />} path="/workload/:kind/:namespace/:name" />
          </Routes>
        </BottomDockProvider>
      </AuthSessionGateProvider>
    </MemoryRouter>,
  );
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
    capabilities: { revision: "snapshot-a", actions: [] },
    features: [
      { name: "overview", availability: "available", reasonCodes: [] },
      { name: "pods", availability: "partial", reasonCodes: ["direct_pod_relationship_is_bounded"] },
      { name: "events", availability: "partial", reasonCodes: ["direct_event_relationship_is_bounded"] },
      { name: "logs", availability: "available", reasonCodes: [] },
    ],
  };
}
