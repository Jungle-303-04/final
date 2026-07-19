import { useEffect, useMemo, useState } from "react";

import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import {
  HomePortFailure,
  type HomeClusterChoice,
  type HomeClusterOverview,
  type HomeFleetClusterSummary,
  type HomeFleetSummary,
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

export interface HomeFleetUsageSummary {
  nodesReady: number;
  nodesTotal: number;
  podsTotal: number;
}

export interface HomeClusterCardsData {
  hasPartialData: boolean;
  overviews: Readonly<Record<string, HomeResourceState<HomeClusterOverview>>>;
  summaries: Readonly<Record<string, HomeFleetClusterSummary>>;
}

export function useHomeClusterCardsData({
  clusters,
  port,
  refreshRevision,
}: {
  clusters: readonly HomeClusterChoice[];
  port: HomePort;
  refreshRevision: number;
}): HomeClusterCardsData {
  const { reportUnauthorized } = useAuthSessionGate();
  const clusterIdsKey = JSON.stringify([...new Set(clusters.map((cluster) => cluster.id))]);
  const clusterIds = useMemo<readonly string[]>(
    () => JSON.parse(clusterIdsKey) as string[],
    [clusterIdsKey],
  );
  const [fleet, setFleet] = useState<HomeResourceState<HomeFleetSummary>>(HOME_IDLE);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    queueMicrotask(() => {
      if (active) setFleet((current) => startResource(current));
    });

    void (async () => {
      try {
        const loadFleetSummary = port.loadFleetSummary;
        if (!loadFleetSummary) throw new HomePortFailure("error");
        const summary = await loadFleetSummary(controller.signal);
        if (!active || controller.signal.aborted) return;
        setFleet(resourceSuccess(summary));
      } catch (error) {
        if (!active || isAbortError(error)) return;
        const failure = toHomeFailure(error);
        if (failure.code === "unauthorized") reportUnauthorized();
        setFleet((current) => resourceFailure(current, failure));
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [port, refreshRevision, reportUnauthorized]);

  return useMemo(() => {
    const summaries: Record<string, HomeFleetClusterSummary> = fleet.phase === "ready"
      ? Object.fromEntries(fleet.data.clusters.map((cluster) => [cluster.clusterId, cluster]))
      : {};
    const overviews: Record<string, HomeResourceState<HomeClusterOverview>> = {};
    for (const clusterId of clusterIds) {
      overviews[clusterId] = fleetOverviewState(fleet, summaries[clusterId]);
    }
    return {
      hasPartialData: Object.values(overviews).some((state) =>
        state.phase === "failed" ||
        (state.phase === "ready" && (
          state.data.usage === null || state.refreshFailure !== null
        ))
      ),
      overviews,
      summaries,
    };
  }, [clusterIds, fleet]);
}

export function projectHomeFleetClusters(
  clusters: readonly HomeClusterChoice[],
  summaries: Readonly<Record<string, HomeFleetClusterSummary>>,
): HomeClusterChoice[] {
  return clusters.map((cluster) => {
    const summary = summaries[cluster.id];
    return {
      ...cluster,
      health: summary?.health ?? null,
      incidentCount: summary?.openIncidents ?? null,
      lastObservedAt: summary?.observedAt ?? null,
      nodeCount: summary?.nodesTotal ?? null,
      openIncidentCount: summary?.openIncidents ?? null,
      podCount: summary?.podsTotal ?? null,
    };
  });
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

function fleetOverviewState(
  fleet: HomeResourceState<HomeFleetSummary>,
  summary: HomeFleetClusterSummary | undefined,
): HomeResourceState<HomeClusterOverview> {
  if (fleet.phase === "idle" || fleet.phase === "loading") return HOME_LOADING;
  if (fleet.phase === "failed") {
    return resourceFailure<HomeClusterOverview>(HOME_LOADING, fleet.failure);
  }
  if (!summary) {
    return resourceFailure<HomeClusterOverview>(
      HOME_LOADING,
      new HomePortFailure("invalid-response"),
    );
  }
  return {
    phase: "ready",
    data: {
      clusterId: summary.clusterId,
      dataQualityWarnings: [],
      health: summary.health,
      incidents: [],
      name: summary.name,
      usage: {
        cpuPercent: summary.cpuPercent,
        memoryPercent: summary.memoryPercent,
        nodesReady: summary.nodesReady,
        nodesTotal: summary.nodesTotal,
        observedAt: summary.observedAt,
        podsRunning: summary.podsRunning,
        podsTotal: summary.podsTotal,
        restartCount: summary.restartCount,
      },
      warnings: [],
      workloads: [],
    },
    failure: null,
    refreshing: fleet.refreshing,
    refreshFailure: fleet.refreshFailure,
  };
}
