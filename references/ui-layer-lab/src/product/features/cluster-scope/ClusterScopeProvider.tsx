import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthSessionGate } from "../auth/AuthSessionGate";
import { HomePortFailure } from "../home/homeContract";
import { selectInitialClusterChoice } from "../home/homeSelection";
import {
  ASYNC_LOADING,
  asyncResourceFailure,
  asyncResourceSuccess,
  isAbortError,
  startAsyncResource,
} from "../../shared/data/asyncResourceState";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import { useVisibleRefreshClock } from "../../shared/data/useVisibleRefreshClock";
import type {
  ClusterScopeCollectionState,
  ClusterScopePort,
  ClusterScopeSelection,
  ClusterScopeValue,
} from "./clusterScopeContract";
import {
  productClusterChangeHref,
  readProductClusterQuery,
} from "./clusterScopeUrl";

const CLUSTER_SCOPE_POLL_INTERVAL_MS = 30_000;
const ClusterScopeContext = createContext<ClusterScopeValue | null>(null);

export function ClusterScopeProvider({
  authorityKey,
  children,
  port,
}: {
  authorityKey: string;
  children: ReactNode;
  port: ClusterScopePort;
}) {
  const { reportUnauthorized } = useAuthSessionGate();
  const location = useLocation();
  const navigate = useNavigate();
  const clusterQuery = readProductClusterQuery(location.search);
  const requestedClusterId = clusterQuery.value;
  const [collection, setCollection] = useState<ClusterScopeCollectionState>(ASYNC_LOADING);
  const { refresh, revision } = useVisibleRefreshClock(true, CLUSTER_SCOPE_POLL_INTERVAL_MS);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setCollection((current) => startAsyncResource(current));
    });
    const request = acquireSharedRequest(
      port,
      `cluster-scope:${authorityKey}:r${revision}`,
      (signal) => port.listClusterChoices(signal),
    );
    void request.promise.then(
      (data) => {
        if (active) setCollection(asyncResourceSuccess(data));
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        const failure = toClusterScopeFailure(error);
        if (failure.code === "unauthorized") {
          reportUnauthorized();
          return;
        }
        if (failure.code === "forbidden") {
          setCollection({ phase: "failed", data: null, failure });
          return;
        }
        setCollection((current) => asyncResourceFailure(current, failure));
      },
    );
    return () => {
      active = false;
      request.release();
    };
  }, [authorityKey, port, reportUnauthorized, revision]);

  useEffect(() => {
    if (collection.phase !== "ready" || clusterQuery.present) return;
    const initial = selectInitialClusterChoice(collection.data.clusters);
    if (!initial) return;
    navigate(productClusterChangeHref(location.pathname, initial.id), { replace: true });
  }, [clusterQuery.present, collection, location.pathname, navigate]);

  const selectedCluster = collection.phase === "ready" && requestedClusterId !== null
    ? collection.data.clusters.find((cluster) => cluster.id === requestedClusterId) ?? null
    : null;
  const scopeKey = useSelectionScopeKey(selectedCluster?.id ?? null);
  const selection = clusterScopeSelection(collection, requestedClusterId, selectedCluster, scopeKey);
  const selectCluster = useCallback((clusterId: string) => {
    if (
      collection.phase !== "ready" ||
      !collection.data.clusters.some((cluster) => cluster.id === clusterId)
    ) return;
    navigate(productClusterChangeHref(location.pathname, clusterId));
  }, [collection, location.pathname, navigate]);

  const value = useMemo<ClusterScopeValue>(() => ({
    collection,
    requestedClusterId,
    selectedCluster,
    selectedClusterExists: selectedCluster !== null,
    selection,
    scopeKey,
    refresh,
    selectCluster,
  }), [
    collection,
    refresh,
    requestedClusterId,
    scopeKey,
    selectedCluster,
    selectCluster,
    selection,
  ]);

  return <ClusterScopeContext.Provider value={value}>{children}</ClusterScopeContext.Provider>;
}

export function useClusterScope(): ClusterScopeValue {
  const scope = useContext(ClusterScopeContext);
  if (!scope) throw new Error("useClusterScope must be used within ClusterScopeProvider");
  return scope;
}

function useSelectionScopeKey(selectedClusterId: string | null): string | null {
  const [scope, setScope] = useState(() => ({
    epoch: selectedClusterId === null ? 0 : 1,
    selectedClusterId,
  }));
  if (scope.selectedClusterId !== selectedClusterId) {
    setScope({ epoch: scope.epoch + 1, selectedClusterId });
    return null;
  }
  return selectedClusterId === null ? null : `${selectedClusterId}:${scope.epoch}`;
}

function clusterScopeSelection(
  collection: ClusterScopeCollectionState,
  requestedClusterId: string | null,
  selectedCluster: ClusterScopeValue["selectedCluster"],
  scopeKey: string | null,
): ClusterScopeSelection {
  if (collection.phase === "idle" || collection.phase === "loading") {
    return { kind: "resolving", requestedId: requestedClusterId };
  }
  if (collection.phase === "failed") return { kind: "unavailable", failure: collection.failure };
  if (collection.data.clusters.length === 0) return { kind: "empty" };
  if (selectedCluster && requestedClusterId !== null && scopeKey !== null) {
    return { kind: "selected", requestedId: requestedClusterId, cluster: selectedCluster, scopeKey };
  }
  return { kind: "unknown", requestedId: requestedClusterId ?? "" };
}

function toClusterScopeFailure(error: unknown): HomePortFailure {
  return error instanceof HomePortFailure ? error : new HomePortFailure("error");
}
