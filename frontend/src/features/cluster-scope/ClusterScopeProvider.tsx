import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuthSessionGate } from "../auth/AuthSessionGate";
import { useUnifiedFilter } from "../filters/UnifiedFilterProvider";
import { HomePortFailure } from "../home/homeContract";
import type { HomeClusterChoice } from "../home/homeContract";
import {
  ASYNC_LOADING,
  asyncResourceFailure,
  asyncResourceSuccess,
  isAbortError,
  startAsyncResource,
} from "../../shared/data/asyncResourceState";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import { useVisibleRefreshClock } from "../../shared/data/useVisibleRefreshClock";
import type { BrowserRefreshPolicy } from "../../shared/data/browserRefreshPolicyRegistry";
import type {
  ClusterScope,
  ScopeTransitionOperationEvent,
} from "../../shared/parity/referenceParity";
import type {
  ClusterScopeCollectionState,
  ClusterScopePort,
  ClusterScopeSelection,
  ClusterScopeValue,
} from "./clusterScopeContract";

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
  const filter = useUnifiedFilter();
  const requestedClusterIds = filter.state.common.clusters;
  const requestedClusterId = requestedClusterIds.length === 1
    ? requestedClusterIds[0] ?? null
    : null;
  const [collectionRecord, setCollectionRecord] = useState<{
    authorityKey: string;
    value: ClusterScopeCollectionState;
  }>(() => ({ authorityKey, value: ASYNC_LOADING }));
  const collection = collectionRecord.authorityKey === authorityKey
    ? collectionRecord.value
    : ASYNC_LOADING;
  const { refresh, revision } = useVisibleRefreshClock(true, CLUSTER_SCOPE_POLL_INTERVAL_MS);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setCollectionRecord((current) => current.authorityKey === authorityKey
        ? { authorityKey, value: startAsyncResource(current.value) }
        : { authorityKey, value: ASYNC_LOADING });
    });
    const request = acquireSharedRequest(
      port,
      `cluster-scope:${authorityKey}:r${revision}`,
      (signal) => port.listClusterChoices(signal),
    );
    void request.promise.then(
      (data) => {
        if (active) setCollectionRecord({ authorityKey, value: asyncResourceSuccess(data) });
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        const failure = toClusterScopeFailure(error);
        if (failure.code === "unauthorized") {
          reportUnauthorized();
          return;
        }
        if (failure.code === "forbidden") {
          setCollectionRecord({
            authorityKey,
            value: { phase: "failed", data: null, failure },
          });
          return;
        }
        setCollectionRecord((current) => current.authorityKey === authorityKey
          ? { authorityKey, value: asyncResourceFailure(current.value, failure) }
          : { authorityKey, value: { phase: "failed", data: null, failure } });
      },
    );
    return () => {
      active = false;
      request.release();
    };
  }, [authorityKey, port, reportUnauthorized, revision]);

  const selectedClusters = useMemo(() => collection.phase === "ready"
    ? collection.data.clusters.filter((cluster) => requestedClusterIds.includes(cluster.id))
    : [], [collection, requestedClusterIds]);
  const selectedCluster = requestedClusterIds.length === 1
    ? selectedClusters[0] ?? null
    : null;
  const scopeKey = useSelectionScopeKey(selectedCluster?.id ?? null);
  const selection = clusterScopeSelection(
    collection,
    requestedClusterIds,
    selectedClusters,
    selectedCluster,
    scopeKey,
  );
  const realtime = useScopeRealtime({
    port,
    policyRevision: revision,
    reportUnauthorized,
    scopeKey,
    selectedCluster,
  });
  const selectCluster = useCallback((clusterId: string) => {
    if (
      collection.phase !== "ready" ||
      !collection.data.clusters.some((cluster) => cluster.id === clusterId)
    ) return;
    filter.updateFilters((current) => ({
      ...current,
      common: { ...current.common, clusters: [clusterId] },
    }), "chip-add");
  }, [collection, filter]);
  const toggleCluster = useCallback((clusterId: string) => {
    if (
      collection.phase !== "ready" ||
      !collection.data.clusters.some((cluster) => cluster.id === clusterId)
    ) return;
    const selected = requestedClusterIds.includes(clusterId);
    filter.updateFilters((current) => ({
      ...current,
      common: {
        ...current.common,
        clusters: selected
          ? current.common.clusters.filter((candidate) => candidate !== clusterId)
          : [...current.common.clusters, clusterId],
      },
    }), selected ? "chip-remove" : "chip-add");
  }, [collection, filter, requestedClusterIds]);
  const clearClusters = useCallback(() => {
    if (requestedClusterIds.length === 0) return;
    filter.updateFilters((current) => ({
      ...current,
      common: { ...current.common, clusters: [] },
    }), "clear-filters");
  }, [filter, requestedClusterIds.length]);

  const value = useMemo<ClusterScopeValue>(() => ({
    collection,
    requestedClusterIds,
    requestedClusterId,
    selectedCluster,
    selectedClusters,
    selectedClusterExists: selectedCluster !== null,
    selection,
    dashboardRefreshPolicy: realtime.dashboardRefreshPolicy,
    scopeInvalidationRevision: realtime.scopeInvalidationRevision,
    scopeKey,
    scopeOperation: realtime.scopeOperation,
    refresh,
    selectCluster,
    toggleCluster,
    clearClusters,
  }), [
    clearClusters,
    collection,
    refresh,
    requestedClusterIds,
    requestedClusterId,
    realtime.dashboardRefreshPolicy,
    realtime.scopeInvalidationRevision,
    realtime.scopeOperation,
    scopeKey,
    selectedCluster,
    selectedClusters,
    selectCluster,
    toggleCluster,
    selection,
  ]);

  return <ClusterScopeContext.Provider value={value}>{children}</ClusterScopeContext.Provider>;
}

function useScopeRealtime({
  port,
  policyRevision,
  reportUnauthorized,
  scopeKey,
  selectedCluster,
}: {
  port: ClusterScopePort;
  policyRevision: number;
  reportUnauthorized: () => void;
  scopeKey: string | null;
  selectedCluster: HomeClusterChoice | null;
}): {
  dashboardRefreshPolicy: BrowserRefreshPolicy | null;
  scopeInvalidationRevision: number;
  scopeOperation: ScopeTransitionOperationEvent | null;
} {
  const clusterId = selectedCluster?.id ?? null;
  const connectionState = selectedCluster?.connectionState ?? null;
  const workspaceId = selectedCluster?.workspaceId ?? null;
  const scope = useMemo<ClusterScope | null>(() => (
    clusterId && connectionState && workspaceId && scopeKey
    ? {
        workspaceId,
        clusterId,
        namespaces: [],
        freshness: scopeFreshness(connectionState),
      }
    : null
  ), [clusterId, connectionState, scopeKey, workspaceId]);
  const [policyRecord, setPolicyRecord] = useState<{
    policy: BrowserRefreshPolicy | null;
    scopeKey: string | null;
  }>({ policy: null, scopeKey: null });
  const [eventRecord, setEventRecord] = useState<{
    operation: ScopeTransitionOperationEvent | null;
    revision: number;
    scopeKey: string | null;
  }>({ operation: null, revision: 0, scopeKey: null });
  const dashboardRefreshPolicy = policyRecord.scopeKey === scopeKey
    ? policyRecord.policy
    : null;
  const currentEvents = eventRecord.scopeKey === scopeKey
    ? eventRecord
    : { operation: null, revision: 0, scopeKey };

  useEffect(() => {
    const loadPolicy = port.loadDashboardRefreshPolicy;
    if (scopeKey === null || !scope || !loadPolicy) return;
    let active = true;
    const request = acquireSharedRequest(
      port,
      `cluster-scope-policy:${scope.workspaceId}:${scopeKey}:r${policyRevision}`,
      (signal) => loadPolicy(signal),
    );
    void request.promise.then(
      (policy) => {
        if (active) setPolicyRecord({ policy, scopeKey });
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        if (error instanceof HomePortFailure && error.code === "unauthorized") {
          reportUnauthorized();
        }
      },
    );
    return () => {
      active = false;
      request.release();
    };
  }, [policyRevision, port, reportUnauthorized, scope, scopeKey]);

  useEffect(() => {
    const subscribe = port.subscribeDashboardInvalidations;
    if (
      scopeKey === null ||
      !scope ||
      !subscribe ||
      dashboardRefreshPolicy?.eventInvalidation !== true
    ) return;
    let active = true;
    let controller: AbortController | null = null;

    const stop = () => {
      controller?.abort();
      controller = null;
    };
    const start = () => {
      stop();
      if (!active || document.visibilityState === "hidden") return;
      controller = new AbortController();
      const signal = controller.signal;
      void (async () => {
        try {
          for await (const _event of subscribe(scope, {
            signal,
            onScopeOperation(operation) {
              if (!active || signal.aborted || !sameScope(operation.scope, scope)) return;
              setEventRecord((current) => ({
                operation,
                revision: current.scopeKey === scopeKey ? current.revision : 0,
                scopeKey,
              }));
            },
          })) {
            if (!active || signal.aborted) return;
            setEventRecord((current) => ({
              operation: current.scopeKey === scopeKey ? current.operation : null,
              revision: current.scopeKey === scopeKey ? current.revision + 1 : 1,
              scopeKey,
            }));
          }
        } catch (error) {
          if (!active || signal.aborted || isAbortError(error)) return;
          if (error instanceof HomePortFailure && error.code === "unauthorized") {
            reportUnauthorized();
          }
        }
      })();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    start();
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [dashboardRefreshPolicy?.eventInvalidation, port, reportUnauthorized, scope, scopeKey]);

  return {
    dashboardRefreshPolicy,
    scopeInvalidationRevision: currentEvents.revision,
    scopeOperation: currentEvents.operation,
  };
}

function sameScope(left: ClusterScope, right: ClusterScope): boolean {
  return left.workspaceId === right.workspaceId && left.clusterId === right.clusterId;
}

function scopeFreshness(
  connectionState: HomeClusterChoice["connectionState"],
): ClusterScope["freshness"] {
  if (connectionState === "online") return "live";
  if (connectionState === "stale") return "stale";
  if (connectionState === "offline") return "disconnected";
  return "partial";
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
  requestedClusterIds: readonly string[],
  selectedClusters: readonly NonNullable<ClusterScopeValue["selectedCluster"]>[],
  selectedCluster: ClusterScopeValue["selectedCluster"],
  scopeKey: string | null,
): ClusterScopeSelection {
  if (collection.phase === "idle" || collection.phase === "loading") {
    return { kind: "resolving", requestedIds: requestedClusterIds };
  }
  if (collection.phase === "failed") return { kind: "unavailable", failure: collection.failure };
  if (collection.data.clusters.length === 0) return { kind: "empty" };
  if (requestedClusterIds.length === 0) return { kind: "unfiltered" };
  if (requestedClusterIds.length > 1) {
    const selectedIds = new Set(selectedClusters.map((cluster) => cluster.id));
    return {
      kind: "multiple",
      requestedIds: requestedClusterIds,
      clusters: selectedClusters,
      unresolvedIds: requestedClusterIds.filter((id) => !selectedIds.has(id)),
    };
  }
  const requestedClusterId = requestedClusterIds[0] ?? "";
  if (selectedCluster && scopeKey !== null) {
    return { kind: "selected", requestedId: requestedClusterId, cluster: selectedCluster, scopeKey };
  }
  return { kind: "unknown", requestedId: requestedClusterId };
}

function toClusterScopeFailure(error: unknown): HomePortFailure {
  return error instanceof HomePortFailure ? error : new HomePortFailure("error");
}
