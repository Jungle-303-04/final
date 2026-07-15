// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HelmPort, HelmRelease } from "../../features/helm/helmContract";
import { HelmPage } from "./HelmPage";

const scopeState = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../../features/cluster-scope/ClusterScopeProvider", () => ({
  useClusterScope: () => scopeState.value,
}));

afterEach(() => cleanup());

beforeEach(() => {
  scopeState.value = {
    selection: { kind: "selected", cluster: { id: "cluster-a" } },
  };
});

describe("HelmPage", () => {
  it("renders only observed release metadata and keeps missing chart data explicit", async () => {
    const port = helmPort();
    renderRoute("/helm", port);

    expect(await screen.findByRole("heading", { name: "Helm releases" })).toBeTruthy();
    expect(screen.getAllByText("storefront").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not observed").length).toBeGreaterThan(0);
    expect(screen.queryByText("must-not-leak")).toBeNull();
    await waitFor(() => expect(port.listReleases).toHaveBeenCalledWith(
      { clusterIds: ["cluster-a"] },
      expect.any(AbortSignal),
    ));
  });

  it("preserves a route identity when a row opens its read-only detail", async () => {
    const port = helmPort();
    renderRoute("/helm", port);

    fireEvent.click(await screen.findByRole("button", { name: "Open storefront" }));

    expect((await screen.findByTestId("location")).textContent).toBe(
      "/helm/detail/cluster-a/storefront/storefront",
    );
  });

  it("renders unsupported provider and executor capabilities as reasons, not action controls", async () => {
    const port = helmPort();
    renderRoute("/helm/detail/cluster-a/storefront/storefront", port);

    expect(await screen.findByRole("heading", { name: "storefront" })).toBeTruthy();
    expect(screen.getByText("helm_manifest_provider_not_integrated")).toBeTruthy();
    expect(screen.getByText("agent_helm_executor_not_integrated")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /upgrade|rollback|uninstall/i })).toBeNull();
    await waitFor(() => expect(port.getRelease).toHaveBeenCalledWith({
      clusterId: "cluster-a",
      namespace: "storefront",
      releaseName: "storefront",
    }, expect.any(AbortSignal)));
  });
});

function renderRoute(path: string, port: HelmPort) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <HelmPage port={port} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function helmPort(): HelmPort & { listReleases: ReturnType<typeof vi.fn>; getRelease: ReturnType<typeof vi.fn> } {
  return {
    listReleases: vi.fn().mockResolvedValue({
      releases: [release()],
      coverage: { availability: "available", observedAt: "2026-07-16T09:00:00Z", reasonCodes: [] },
    }),
    getRelease: vi.fn().mockResolvedValue({
      release: release(),
      history: [{
        storage: release().storage,
        revision: 3,
        status: "deployed",
        observedAt: "2026-07-16T09:00:00Z",
      }],
      manifest: unavailable("helm_manifest_provider_not_integrated"),
      values: unavailable("helm_values_provider_not_integrated"),
      ownedResources: unavailable("owned_resources_not_correlated"),
      commands: unavailable("agent_helm_executor_not_integrated"),
    }),
  };
}

function release(): HelmRelease {
  return {
    scope: {
      workspaceId: "workspace-a",
      clusterId: "cluster-a",
      namespaces: ["storefront"],
      freshness: "live",
    },
    name: "storefront",
    storageNamespace: "storefront",
    storage: {
      apiGroup: "",
      version: "v1",
      kind: "Secret",
      namespace: "storefront",
      name: "sh.helm.release.v1.storefront.v3",
      uid: "storage-3",
    },
    chart: null,
    appVersion: null,
    status: "deployed",
    revision: 3,
    observedAt: "2026-07-16T09:00:00Z",
    resourceHealth: { ...unavailable("owned_resources_not_correlated"), health: null },
  };
}

function unavailable(reasonCode: string) {
  return { availability: "unavailable" as const, reasonCode };
}
