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
import { acquireHomeRequest } from "./homeRequest";

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
    let active = true;
    const sharedRequest = acquireHomeRequest(
      port,
      `fleet-summary:r${refreshRevision}`,
      (signal) => {
        const loadFleetSummary = port.loadFleetSummary;
        if (!loadFleetSummary) return Promise.reject(new HomePortFailure("error"));
        return loadFleetSummary(signal);
      },
    );

    queueMicrotask(() => {
      if (active) setFleet((current) => startResource(current));
    });

    void (async () => {
      try {
        const summary = await sharedRequest.promise;
        if (!active) return;
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
      sharedRequest.release();
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
    const coverageIncomplete = clusterIds.some((clusterId) => {
      const coverage = summaries[clusterId]?.coverage;
      return coverage !== undefined && [coverage.inventory, coverage.cpu, coverage.memory]
        .some((dimension) => dimension.availability !== "available");
    });
    return {
      hasPartialData: coverageIncomplete || Object.values(overviews).some((state) =>
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
    const inventoryObserved = summary === undefined ||
      summary.coverage === undefined ||
      summary.coverage.inventory.availability !== "unavailable";
    return {
      ...cluster,
      health: summary?.health ?? null,
      incidentCount: summary?.openIncidents ?? null,
      lastObservedAt: summary?.observedAt ?? null,
      nodeCount: inventoryObserved ? summary?.nodesTotal ?? null : null,
      openIncidentCount: summary?.openIncidents ?? null,
      podCount: inventoryObserved ? summary?.podsTotal ?? null : null,
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
  const coverage = summary.coverage;
  const inventoryObserved = coverage === undefined || coverage.inventory.availability !== "unavailable";
  return {
    phase: "ready",
    data: {
      clusterId: summary.clusterId,
      dataQualityWarnings: [],
      health: summary.health,
      incidents: [],
      name: summary.name,
      usage: inventoryObserved ? {
        cpuPercent: coverage === undefined || coverage.cpu.availability !== "unavailable"
          ? summary.cpuPercent
          : null,
        memoryPercent: coverage === undefined || coverage.memory.availability !== "unavailable"
          ? summary.memoryPercent
          : null,
        nodesReady: summary.nodesReady,
        nodesTotal: summary.nodesTotal,
        observedAt: summary.observedAt,
        podsRunning: summary.podsRunning,
        podsTotal: summary.podsTotal,
        restartCount: summary.restartCount,
      } : null,
      warnings: [],
      workloads: [],
    },
    failure: null,
    refreshing: fleet.refreshing,
    refreshFailure: fleet.refreshFailure,
  };
}
