// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import type { CompareCandidates, ComparePort, CompareResult } from "../../features/compare/compareContract";
import { CompareRoute } from "./CompareRoute";

describe("CompareRoute", () => {
  it("canonicalizes the resolved version and provides only safe presentation controls", async () => {
    const user = userEvent.setup();
    const port: ComparePort = {
      getComparison: vi.fn(async () => result()),
      getCandidates: vi.fn(async () => candidates()),
    };
    renderRoute(port);

    expect(await screen.findByRole("heading", { name: "Compare" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("location").textContent).toContain("apiVersion=v1"));
    await user.click(await screen.findByRole("button", { name: "Unified" }));
    expect(screen.getByLabelText("Unified comparison")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Differences only" }));
    expect(screen.getByText("spec.replicas")).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Change" })[0]!);
    expect(await screen.findByRole("dialog", { name: "Choose side A resource" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "shop/api-c" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toContain("a=shop%2Fapi-c"));
  });
});

function renderRoute(port: ComparePort) {
  return render(
    <MemoryRouter initialEntries={["/compare?cluster=cluster-a&kind=deployments&apiGroup=apps&a=shop%2Fapi-a&b=shop%2Fapi-b"]}>
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        <Routes>
          <Route element={<CompareRoute port={port} />} path="/compare" />
        </Routes>
        <LocationProbe />
      </AuthSessionGateProvider>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function result(): CompareResult {
  return {
    scope: { workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: ["shop"], freshness: "live" },
    descriptor: {
      routeKind: "deployments",
      apiGroup: "apps",
      apiVersion: "v1",
      kubernetesKind: "Deployment",
      resourceType: "workload",
      projectionKind: "workload_replicas",
    },
    coverage: { availability: "partial", latestSnapshotId: "snapshot-a", reasonCodes: ["source_resources_incomplete"] },
    presentation: { modes: ["side-by-side", "unified"], swap: true, diffOnly: true },
    a: manifest("api-a", "uid-a", 2),
    b: manifest("api-b", "uid-b", 3),
  };
}

function candidates(): CompareCandidates {
  return {
    scope: result().scope,
    descriptor: result().descriptor,
    coverage: result().coverage,
    candidates: [{
      resource: { apiGroup: "apps", version: "v1", kind: "Deployment", namespace: "shop", name: "api-c", uid: "uid-c" },
      provenance: {
        observationSnapshotId: "snapshot-a",
        latestSnapshotId: "snapshot-a",
        observedAt: "2026-07-16T09:00:00Z",
        availability: "available",
        reasonCodes: [],
      },
    }],
    excludedCount: 0,
  };
}

function manifest(name: string, uid: string, replicas: number): CompareResult["a"] {
  return {
    resource: { apiGroup: "apps", version: "v1", kind: "Deployment", namespace: "shop", name, uid },
    metadata: { namespace: "shop", name },
    projection: { projectionKind: "workload_replicas", replicas },
    provenance: {
      observationSnapshotId: "snapshot-a",
      latestSnapshotId: "snapshot-a",
      observedAt: "2026-07-16T09:00:00Z",
      availability: "available",
      reasonCodes: [],
    },
    omittedPaths: [],
  };
}
