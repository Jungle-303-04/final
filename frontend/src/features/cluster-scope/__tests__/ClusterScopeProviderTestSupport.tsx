import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import { vi } from "vitest";
import { AuthSessionGateProvider } from "../../auth/AuthSessionGate";
import { UnifiedFilterProvider, useUnifiedFilter } from "../../filters/UnifiedFilterProvider";
import type { HomeClusterChoice } from "../../home/homeContract";
import type { ClusterScopePort } from "../clusterScopeContract";
import { ClusterScopeProvider, useClusterScope } from "../ClusterScopeProvider";

const CLUSTERS = [
  cluster("cluster-a", "production", "online"),
  cluster("cluster-b", "staging", "stale"),
] as const;

export function ScopeProbe() {
  const scope = useClusterScope();
  const filter = useUnifiedFilter();
  const location = useLocation();
  const navigationType = useNavigationType();
  const refreshFailure = scope.collection.phase === "ready"
    ? scope.collection.refreshFailure?.code ?? null
    : null;
  const failure = scope.collection.phase === "failed" ? scope.collection.failure.code : null;
  const state = {
    failure,
    filterClusters: filter.state.common.clusters,
    location: `${location.pathname}${location.search}${location.hash}`,
    navigationType,
    needsCanonicalWrite: filter.needsCanonicalWrite,
    phase: scope.collection.phase,
    refreshFailure,
    requestedClusterId: scope.requestedClusterId,
    scopeInvalidationRevision: scope.scopeInvalidationRevision,
    scopeKey: scope.scopeKey,
    scopeOperation: scope.scopeOperation,
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

export function renderScope(
  port: ClusterScopePort,
  entry: string,
  strict = false,
  reportUnauthorized = vi.fn(),
) {
  const tree = scopeTree(port, entry, "workspace-a:user-a", reportUnauthorized);
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

export function scopeTree(
  port: ClusterScopePort,
  entry: string,
  authorityKey: string,
  reportUnauthorized = vi.fn(),
) {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <AuthSessionGateProvider reportUnauthorized={reportUnauthorized}>
        <UnifiedFilterProvider>
          <ClusterScopeProvider authorityKey={authorityKey} port={port}>
            <ScopeProbe />
          </ClusterScopeProvider>
        </UnifiedFilterProvider>
      </AuthSessionGateProvider>
    </MemoryRouter>
  );
}

export function readState(): {
  failure: string | null;
  filterClusters: readonly string[];
  location: string;
  navigationType: string;
  needsCanonicalWrite: boolean;
  phase: string;
  refreshFailure: string | null;
  requestedClusterId: string | null;
  scopeInvalidationRevision: number;
  scopeKey: string | null;
  scopeOperation: unknown;
  selectedClusterId: string | null;
  selection: string;
} {
  return JSON.parse(screen.getByTestId("cluster-scope-state").textContent ?? "{}") as ReturnType<
    typeof readState
  >;
}

export function collection(clusters: readonly HomeClusterChoice[] = CLUSTERS) {
  return { completeness: "unknown" as const, clusters: [...clusters] };
}

export function portOf(value: ReturnType<typeof collection>): ClusterScopePort {
  return { listClusterChoices: vi.fn(async () => value) };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
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
    provider: "unknown",
    connectionStage: null,
    registrationState: "active",
    connectionState,
    lastObservedAt: "2026-07-13T00:00:00.000Z",
    nodeCount: 2,
    podCount: 6,
    incidentCount: 0,
  };
}
