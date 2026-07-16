// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HelmPortFailure,
  type HelmFailureCode,
  type HelmPort,
  type HelmRelease,
} from "../../features/helm/helmContract";
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

  it("renders safe availability copy without exposing internal provider or executor codes", async () => {
    const port = helmPort();
    renderRoute("/helm/detail/cluster-a/storefront/storefront", port);

    expect(await screen.findByRole("heading", { name: "storefront" })).toBeTruthy();
    expect(screen.getByText("A safe manifest source is not available for this release.")).toBeTruthy();
    expect(screen.getByText("Helm commands are not available for this release.")).toBeTruthy();
    for (const reasonCode of [
      "helm_manifest_provider_not_integrated",
      "helm_values_provider_not_integrated",
      "owned_resources_not_correlated",
      "agent_helm_executor_not_integrated",
    ]) expect(screen.queryByText(reasonCode)).toBeNull();
    expect(screen.queryByRole("button", { name: /upgrade|rollback|uninstall/i })).toBeNull();
    await waitFor(() => expect(port.getRelease).toHaveBeenCalledWith({
      clusterId: "cluster-a",
      namespace: "storefront",
      releaseName: "storefront",
    }, expect.any(AbortSignal)));
  });

  it("maps known and unknown coverage reasons to safe copy", async () => {
    const port = helmPort();
    port.listReleases.mockResolvedValue({
      releases: [release()],
      coverage: {
        availability: "unavailable",
        observedAt: "2026-07-16T09:00:00Z",
        reasonCodes: [
          "authorization_scope_empty",
          "inventory_snapshot_unavailable:cluster-a",
          "source_resources_incomplete",
          "helm_storage_labels_incomplete",
          "unknown_internal_helm_reason",
        ],
      },
    });
    renderRoute("/helm", port);

    expect(await screen.findByText("Release discovery is unavailable for this scope.")).toBeTruthy();
    expect(screen.getByText("The current authorization scope does not permit release discovery.")).toBeTruthy();
    expect(screen.getByText("A current inventory observation is not available for this scope.")).toBeTruthy();
    expect(screen.getByText("Some inventory observations are incomplete for this scope.")).toBeTruthy();
    expect(screen.getByText("The source did not provide complete release discovery evidence.")).toBeTruthy();
    for (const reasonCode of [
      "authorization_scope_empty",
      "inventory_snapshot_unavailable:cluster-a",
      "source_resources_incomplete",
      "helm_storage_labels_incomplete",
      "unknown_internal_helm_reason",
    ]) expect(screen.queryByText(reasonCode)).toBeNull();
  });

  it("keeps forbidden Helm reads safe without rendering the raw failure code twice", async () => {
    const port = helmPort();
    port.listReleases.mockRejectedValue(new HelmPortFailure("forbidden"));
    renderRoute("/helm", port);

    expect(await screen.findByText("You cannot access this scope")).toBeTruthy();
    expect(screen.getByText("Your account is not authorized to read Helm release metadata for this scope.")).toBeTruthy();
    // ProductStateScreen supplies the single standardized error code. Helm must not echo it as detail.
    expect(screen.getAllByText("forbidden", { exact: true })).toHaveLength(1);
  });

  it("uses safe offline copy without exposing the raw failure detail", async () => {
    const port = helmPort();
    port.listReleases.mockRejectedValue(new HelmPortFailure("offline"));
    renderRoute("/helm", port);

    expect(await screen.findByText("Helm release data cannot be reached right now. Check the connection and try again.")).toBeTruthy();
    expect(screen.queryByText("offline", { exact: true })).toBeNull();
  });

  it("uses generic safe copy when a runtime failure code is unknown", async () => {
    const port = helmPort();
    const unknownCode = "unexpected_helm_failure";
    port.listReleases.mockRejectedValue(new HelmPortFailure(unknownCode as HelmFailureCode));
    renderRoute("/helm", port);

    expect(await screen.findByText("Helm release data could not be loaded. Try again shortly.")).toBeTruthy();
    expect(screen.queryByText(unknownCode, { exact: true })).toBeNull();
  });

  it("uses generic safe copy for an unknown unavailable feature reason", async () => {
    const port = helmPort();
    port.getRelease.mockResolvedValue({
      ...detail(),
      manifest: unavailable("unknown_internal_helm_feature_reason"),
    });
    renderRoute("/helm/detail/cluster-a/storefront/storefront", port);

    expect(await screen.findByText("This release capability is not available from the current source.")).toBeTruthy();
    expect(screen.queryByText("unknown_internal_helm_feature_reason")).toBeNull();
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
    getRelease: vi.fn().mockResolvedValue(detail()),
  };
}

function detail() {
  return {
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
