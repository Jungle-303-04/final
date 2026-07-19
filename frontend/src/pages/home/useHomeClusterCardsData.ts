import { useEffect, useMemo, useState } from "react";

import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import {
  HomePortFailure,
  type HomeClusterChoice,
  type HomeClusterOverview,
  type HomePort,
} from "../../features/home/homeContract";
import {
  HOME_IDLE,
  HOME_LOADING,
  isAbortError,
  resourceFailure,
  resourceSuccess,
  startResource,
  toHomeFailure,
  type HomeResourceState,
} from "./homePageStateModel";

const MAX_CLUSTER_OVERVIEW_CONCURRENCY = 3;

export interface HomeFleetUsageSummary {
  nodesReady: number;
  nodesTotal: number;
  podsTotal: number;
}

export interface HomeClusterCardsData {
  hasPartialData: boolean;
  overviews: Readonly<Record<string, HomeResourceState<HomeClusterOverview>>>;
}

export function useHomeClusterCardsData({
  clusters,
  port,
  refreshRevision,
  selectedClusterId,
  selectedOverview,
}: {
  clusters: readonly HomeClusterChoice[];
  port: HomePort;
  refreshRevision: number;
  selectedClusterId: string | null;
  selectedOverview: HomeResourceState<HomeClusterOverview>;
}): HomeClusterCardsData {
  const { reportUnauthorized } = useAuthSessionGate();
  const clusterIdsKey = JSON.stringify([...new Set(clusters.map((cluster) => cluster.id))]);
  const clusterIds = useMemo<readonly string[]>(
    () => JSON.parse(clusterIdsKey) as string[],
    [clusterIdsKey],
  );
  const [loaded, setLoaded] = useState<Record<string, HomeResourceState<HomeClusterOverview>>>({});

  useEffect(() => {
    const requestedIds = clusterIds.filter((clusterId) => clusterId !== selectedClusterId);
    const requested = new Set(requestedIds);
    const controller = new AbortController();
    let active = true;

    queueMicrotask(() => {
      if (!active) return;
      setLoaded((current) => Object.fromEntries(requestedIds.map((clusterId) => [
        clusterId,
        startResource(current[clusterId] ?? HOME_IDLE),
      ])));
    });

    void runBounded(requestedIds, MAX_CLUSTER_OVERVIEW_CONCURRENCY, async (clusterId) => {
      try {
        const overview = await port.loadClusterOverview(clusterId, controller.signal);
        if (overview.clusterId !== clusterId) throw new HomePortFailure("invalid-response");
        if (!active || controller.signal.aborted) return;
        setLoaded((current) => requested.has(clusterId)
          ? { ...current, [clusterId]: resourceSuccess(overview) }
          : current);
      } catch (error) {
        if (!active || isAbortError(error)) return;
        const failure = toHomeFailure(error);
        if (failure.code === "unauthorized") reportUnauthorized();
        setLoaded((current) => requested.has(clusterId)
          ? {
              ...current,
              [clusterId]: resourceFailure(current[clusterId] ?? HOME_LOADING, failure),
            }
          : current);
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [clusterIds, port, refreshRevision, reportUnauthorized, selectedClusterId]);

  return useMemo(() => {
    const overviews: Record<string, HomeResourceState<HomeClusterOverview>> = {};
    for (const clusterId of clusterIds) {
      overviews[clusterId] = clusterId === selectedClusterId
        ? selectedOverview
        : loaded[clusterId] ?? HOME_LOADING;
    }
    return {
      hasPartialData: Object.values(overviews).some((state) =>
        state.phase === "failed" ||
        (state.phase === "ready" && (
          state.data.usage === null || state.refreshFailure !== null
        ))
      ),
      overviews,
    };
  }, [clusterIds, loaded, selectedClusterId, selectedOverview]);
}

export function summarizeHomeFleetUsage(
  clusters: readonly HomeClusterChoice[],
  overviews: Readonly<Record<string, HomeResourceState<HomeClusterOverview>>>,
): HomeFleetUsageSummary | null {
  if (clusters.length === 0) return null;
  let nodesReady = 0;
  let nodesTotal = 0;
  let podsTotal = 0;
  for (const cluster of clusters) {
    const state = overviews[cluster.id];
    if (
      state?.phase !== "ready" ||
      state.refreshFailure !== null ||
      state.data.usage === null
    ) return null;
    nodesReady += state.data.usage.nodesReady;
    nodesTotal += state.data.usage.nodesTotal;
    podsTotal += state.data.usage.podsTotal;
  }
  return { nodesReady, nodesTotal, podsTotal };
}

async function runBounded<T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await operation(values[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
}
