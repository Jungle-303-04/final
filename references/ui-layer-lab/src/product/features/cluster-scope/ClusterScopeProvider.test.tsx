// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import { AuthSessionGateProvider } from "../auth/AuthSessionGate";
import { HomePortFailure, type HomeClusterChoice } from "../home/homeContract";
import type { ClusterScopePort } from "./clusterScopeContract";
import { ClusterScopeProvider, useClusterScope } from "./ClusterScopeProvider";

const CLUSTERS = [
  cluster("cluster-a", "production", "online"),
  cluster("cluster-b", "staging", "stale"),
] as const;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ClusterScopeProvider", () => {
  it("shares one cluster collection request across a StrictMode remount", async () => {
    const listClusterChoices = vi.fn(async () => collection());

    renderScope({ listClusterChoices }, "/product?cluster=cluster-a", true);

    await waitFor(() => expect(readState().selection).toBe("selected"));
    expect(listClusterChoices).toHaveBeenCalledTimes(1);
  });

  it("defaults only an absent scope with replace navigation and clears route-local queries", async () => {
    renderScope(portOf(collection()), "/product/resources?namespace=default&resource=pod");

    await waitFor(() => {
      expect(readState()).toMatchObject({
        location: "/product/resources?cluster=cluster-a",
        navigationType: "REPLACE",
        requestedClusterId: "cluster-a",
        selectedClusterId: "cluster-a",
        selection: "selected",
      });
    });
  });

  it.each([
    ["unknown", "/product?cluster=missing&node=worker-a", "missing"],
    ["explicit empty", "/product?cluster=&node=worker-a", ""],
  ])("preserves an %s URL scope without silently falling back", async (_case, entry, expectedId) => {
    renderScope(portOf(collection()), entry);

    await waitFor(() => expect(readState().phase).toBe("ready"));
    expect(readState()).toMatchObject({
      location: entry,
      requestedClusterId: expectedId,
      selectedClusterId: null,
      selection: "unknown",
    });
  });

  it("keeps the pathname and removes every route-local query when the user selects a cluster", async () => {
    const user = userEvent.setup();
    renderScope(
      portOf(collection()),
      "/product/resources?cluster=cluster-a&namespace=default&resource=pod",
    );

    await waitFor(() => expect(readState().selection).toBe("selected"));
    await user.click(screen.getByRole("button", { name: "select cluster-b" }));

    await waitFor(() => {
      expect(readState()).toMatchObject({
        location: "/product/resources?cluster=cluster-b",
        requestedClusterId: "cluster-b",
        selectedClusterId: "cluster-b",
      });
    });
  });

  it("reports unauthorized collection failures through the auth gate", async () => {
    const reportUnauthorized = vi.fn();
    const port: ClusterScopePort = {
      listClusterChoices: vi.fn(async () => {
        throw new HomePortFailure("unauthorized");
      }),
    };

    renderScope(port, "/product?cluster=cluster-a", false, reportUnauthorized);

    await waitFor(() => expect(reportUnauthorized).toHaveBeenCalledTimes(1));
    expect(readState()).toMatchObject({ phase: "loading", selection: "resolving" });
  });

  it("removes cached collection data when a refresh becomes forbidden", async () => {
    const user = userEvent.setup();
    const listClusterChoices = vi.fn()
      .mockResolvedValueOnce(collection())
      .mockRejectedValueOnce(new HomePortFailure("forbidden"));
    renderScope({ listClusterChoices }, "/product?cluster=cluster-a");

    await waitFor(() => expect(readState().selection).toBe("selected"));
    await user.click(screen.getByRole("button", { name: "refresh scope" }));

    await waitFor(() => {
      expect(readState()).toMatchObject({
        failure: "forbidden",
        phase: "failed",
        selectedClusterId: null,
        selection: "unavailable",
      });
    });
  });

  it("retains the last verified collection when a background refresh fails", async () => {
    const user = userEvent.setup();
    const listClusterChoices = vi.fn()
      .mockResolvedValueOnce(collection())
      .mockRejectedValueOnce(new HomePortFailure("offline"));
    renderScope({ listClusterChoices }, "/product?cluster=cluster-a");

    await waitFor(() => expect(readState().selection).toBe("selected"));
    await user.click(screen.getByRole("button", { name: "refresh scope" }));

    await waitFor(() => {
      expect(readState()).toMatchObject({
        phase: "ready",
        refreshFailure: "offline",
        selectedClusterId: "cluster-a",
        selection: "selected",
      });
    });
  });

  it("rotates the selection scope key for A to B to A without reusing stale state", async () => {
    const user = userEvent.setup();
    renderScope(portOf(collection()), "/product?cluster=cluster-a");

    await waitFor(() => expect(readState().selection).toBe("selected"));
    const firstA = readState().scopeKey;

    await user.click(screen.getByRole("button", { name: "select cluster-b" }));
    await waitFor(() => expect(readState().selectedClusterId).toBe("cluster-b"));
    const clusterB = readState().scopeKey;

    await user.click(screen.getByRole("button", { name: "select cluster-a" }));
    await waitFor(() => expect(readState().selectedClusterId).toBe("cluster-a"));
    const secondA = readState().scopeKey;

    expect(firstA).toMatch(/^cluster-a:/u);
    expect(clusterB).toMatch(/^cluster-b:/u);
    expect(secondA).toMatch(/^cluster-a:/u);
    expect(new Set([firstA, clusterB, secondA])).toHaveLength(3);
  });
});

function ScopeProbe() {
  const scope = useClusterScope();
  const location = useLocation();
  const navigationType = useNavigationType();
  const refreshFailure = scope.collection.phase === "ready"
    ? scope.collection.refreshFailure?.code ?? null
    : null;
  const failure = scope.collection.phase === "failed" ? scope.collection.failure.code : null;
  const state = {
    failure,
    location: `${location.pathname}${location.search}`,
    navigationType,
    phase: scope.collection.phase,
    refreshFailure,
    requestedClusterId: scope.requestedClusterId,
    scopeKey: scope.scopeKey,
    selectedClusterId: scope.selectedCluster?.id ?? null,
    selection: scope.selection.kind,
  };

  return (
    <>
      <output data-testid="cluster-scope-state">{JSON.stringify(state)}</output>
      <button onClick={scope.refresh} type="button">refresh scope</button>
      <button onClick={() => scope.selectCluster("cluster-a")} type="button">
        select cluster-a
      </button>
      <button onClick={() => scope.selectCluster("cluster-b")} type="button">
        select cluster-b
      </button>
    </>
  );
}

function renderScope(
  port: ClusterScopePort,
  entry: string,
  strict = false,
  reportUnauthorized = vi.fn(),
) {
  const tree = (
    <MemoryRouter initialEntries={[entry]}>
      <AuthSessionGateProvider reportUnauthorized={reportUnauthorized}>
        <ClusterScopeProvider authorityKey="workspace-a:user-a" port={port}>
          <ScopeProbe />
        </ClusterScopeProvider>
      </AuthSessionGateProvider>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function readState(): {
  failure: string | null;
  location: string;
  navigationType: string;
  phase: string;
  refreshFailure: string | null;
  requestedClusterId: string | null;
  scopeKey: string | null;
  selectedClusterId: string | null;
  selection: string;
} {
  return JSON.parse(screen.getByTestId("cluster-scope-state").textContent ?? "{}") as ReturnType<
    typeof readState
  >;
}

function collection(clusters: readonly HomeClusterChoice[] = CLUSTERS) {
  return { completeness: "unknown" as const, clusters: [...clusters] };
}

function portOf(value: ReturnType<typeof collection>): ClusterScopePort {
  return { listClusterChoices: vi.fn(async () => value) };
}

function cluster(
  id: string,
  environment: string,
  connectionState: HomeClusterChoice["connectionState"],
): HomeClusterChoice {
  return {
    id,
    workspaceId: "workspace-a",
    name: id,
    environment,
    registrationState: "active",
    connectionState,
    lastObservedAt: "2026-07-13T00:00:00.000Z",
    nodeCount: 2,
    podCount: 6,
    incidentCount: 0,
  };
}
