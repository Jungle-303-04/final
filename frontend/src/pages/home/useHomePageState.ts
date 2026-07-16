import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopeSelection } from "../../features/cluster-scope/clusterScopeContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import {
  type HomeClusterChoices,
  type HomeClusterOverview,
  type HomeInsights,
  type HomeNodeCollection,
  type HomePodCollection,
  type HomePort,
} from "../../features/home/homeContract";
import {
  isAbortError,
  type HomeClusterAccess,
  type HomeResourceState,
  type HomeSelectedNodeResolution,
} from "./homePageStateModel";
import { useHomeClusterFrame } from "./useHomeClusterFrame";
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";
import type { BrowserRefreshPolicy } from "../../shared/data/browserRefreshPolicyRegistry";

export type { HomeResourceState } from "./homePageStateModel";

export interface HomePageState {
  clusterSelection: ClusterScopeSelection;
  choices: HomeResourceState<HomeClusterChoices>;
  clusterAccess: HomeClusterAccess;
  overview: HomeResourceState<HomeClusterOverview>;
  insights: HomeResourceState<HomeInsights>;
  nodes: HomeResourceState<HomeNodeCollection>;
  pods: HomeResourceState<HomePodCollection>;
  selectedClusterId: string | null;
  selectedNodeName: string | null;
  selectedNodeResolution: HomeSelectedNodeResolution;
  selectedClusterExists: boolean;
  dataUpdatedAt: number;
  refreshIntervalSeconds: number | null;
  refresh: () => void;
  refreshInsights: () => void;
  selectCluster: (clusterId: string) => void;
  selectNode: (nodeName: string) => void;
  closeNode: () => void;
  registerNodeButton: (nodeName: string, element: HTMLButtonElement | null) => void;
}

export function useHomePageState(port: HomePort): HomePageState {
  const { reportUnauthorized } = useAuthSessionGate();
  const clusterScope = useClusterScope();
  const filter = useUnifiedFilter();
  const refreshClusterScope = clusterScope.refresh;
  const choices = clusterScope.collection;
  const nodeButtons = useRef(new Map<string, HTMLButtonElement>());
  const restoreNodeFocus = useRef<string | null>(null);
  const focusPodHeading = useRef(false);
  const selectedClusterId = clusterScope.requestedClusterId;
  const selectedNodeName = filter.detail.node;
  const [dashboardRevision, setDashboardRevision] = useState(0);
  const dashboardRefresh = useServerRefreshScheduler(
    () => setDashboardRevision((current) => current + 1),
  );
  const observedDashboardRevision = useRef(dashboardRevision);
  const resumedFromBackground = useRef(false);
  const [dataUpdatedAt, setDataUpdatedAt] = useState(0);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState<number | null>(null);
  const [dashboardPolicy, setDashboardPolicy] = useState<BrowserRefreshPolicy | null>(null);
  const selectedClusterExists = clusterScope.selectedClusterExists;
  const scopeKey = clusterScope.scopeKey;
  const clusterFrame = useHomeClusterFrame({
    clusterId: selectedClusterExists ? selectedClusterId : null,
    port,
    podRefreshRevision: dashboardRevision,
    refreshRevision: dashboardRevision,
    reportUnauthorized,
    scopeKey,
    selectedNodeName,
  });
  const refreshInsights = clusterFrame.refreshInsights;
  const choicesData = choices.phase === "ready" ? choices.data : null;
  const overviewData = clusterFrame.overview.phase === "ready"
    ? clusterFrame.overview.data
    : null;
  const nodesData = clusterFrame.nodes.phase === "ready"
    ? clusterFrame.nodes.data
    : null;
  const insightsData = clusterFrame.insights.phase === "ready"
    ? clusterFrame.insights.data
    : null;
  const podsData = clusterFrame.pods.phase === "ready"
    ? clusterFrame.pods.data
    : null;

  useEffect(() => {
    if (observedDashboardRevision.current === dashboardRevision) return;
    observedDashboardRevision.current = dashboardRevision;
    if (resumedFromBackground.current) {
      resumedFromBackground.current = false;
      return;
    }
    refreshClusterScope();
  }, [dashboardRevision, refreshClusterScope]);

  useEffect(() => {
    const rememberVisibilityResume = () => {
      if (document.visibilityState === "visible") resumedFromBackground.current = true;
    };
    document.addEventListener("visibilitychange", rememberVisibilityResume);
    return () => document.removeEventListener("visibilitychange", rememberVisibilityResume);
  }, []);

  useEffect(() => {
    if (!selectedClusterExists || scopeKey === null) {
      dashboardRefresh.backgroundFailure();
      return;
    }
    const sections = selectedNodeName === null
      ? [clusterFrame.overview, clusterFrame.nodes]
      : [clusterFrame.overview, clusterFrame.nodes, clusterFrame.pods];
    if (sections.some((section) =>
      section.phase === "failed" ||
      (section.phase === "ready" && section.refreshFailure !== null)
    )) {
      dashboardRefresh.backgroundFailure();
      return;
    }
    if (!sections.every((section) => section.phase === "ready" && !section.refreshing)) return;

    const controller = new AbortController();
    void port.loadDashboardRefreshPolicy(controller.signal).then((policy) => {
      if (controller.signal.aborted) return;
      setRefreshIntervalSeconds(policy.refreshAfterSeconds);
      setDashboardPolicy(policy);
      dashboardRefresh.acceptSuccess(policy);
    }).catch((error: unknown) => {
      if (controller.signal.aborted || isAbortError(error)) return;
      dashboardRefresh.backgroundFailure();
    });
    return () => controller.abort();
  }, [
    clusterFrame.nodes,
    clusterFrame.overview,
    clusterFrame.pods,
    dashboardRefresh,
    port,
    scopeKey,
    selectedClusterExists,
    selectedNodeName,
  ]);

  useEffect(() => {
    if (
      dashboardPolicy?.eventInvalidation !== true ||
      !selectedClusterExists ||
      selectedClusterId === null ||
      scopeKey === null
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
          for await (const _event of port.subscribeDashboardInvalidations(selectedClusterId, {
            signal,
          })) {
            if (!active || signal.aborted) return;
            dashboardRefresh.requestEventInvalidation();
          }
        } catch (error) {
          if (!active || signal.aborted || isAbortError(error)) return;
          if (error instanceof Error && "code" in error && error.code === "unauthorized") {
            reportUnauthorized();
          }
          // The server cadence remains the fail-safe after a stream failure.
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
  }, [
    dashboardPolicy?.eventInvalidation,
    dashboardRefresh,
    port,
    reportUnauthorized,
    scopeKey,
    selectedClusterExists,
    selectedClusterId,
  ]);

  useEffect(() => {
    const successfulData = [choicesData, overviewData, insightsData, nodesData, podsData];
    if (successfulData.every((value) => value === null)) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setDataUpdatedAt(Date.now());
    });
    return () => {
      active = false;
    };
  }, [choicesData, insightsData, nodesData, overviewData, podsData]);

  useEffect(() => {
    if (!focusPodHeading.current || !selectedNodeName || clusterFrame.pods.phase === "idle") return;
    const heading = document.getElementById("pod-list-title");
    if (!heading) return;
    focusPodHeading.current = false;
    heading.focus();
  }, [clusterFrame.pods.phase, selectedNodeName]);

  const updateNodeSelection = useCallback((nodeName?: string) => {
    filter.updateDetail((current) => ({
      ...current,
      node: nodeName ?? null,
    }), nodeName ? "drill-in" : "detail-close");
  }, [filter]);

  const selectNode = useCallback((nodeName: string) => {
    if (!selectedClusterId) return;
    focusPodHeading.current = true;
    updateNodeSelection(nodeName);
  }, [selectedClusterId, updateNodeSelection]);

  const closeNode = useCallback(() => {
    if (!selectedClusterId || !selectedNodeName) return;
    restoreNodeFocus.current = selectedNodeName;
    updateNodeSelection();
    requestAnimationFrame(() => {
      const nodeName = restoreNodeFocus.current;
      restoreNodeFocus.current = null;
      if (nodeName) nodeButtons.current.get(nodeName)?.focus();
    });
  }, [selectedClusterId, selectedNodeName, updateNodeSelection]);

  const refresh = useCallback(() => {
    dashboardRefresh.requestRefresh();
    refreshInsights();
  }, [dashboardRefresh, refreshInsights]);

  return useMemo(() => ({
    choices,
    clusterSelection: clusterScope.selection,
    ...clusterFrame,
    selectedClusterId,
    selectedNodeName,
    selectedClusterExists,
    dataUpdatedAt,
    refreshIntervalSeconds,
    refresh,
    selectCluster: clusterScope.selectCluster,
    selectNode,
    closeNode,
    registerNodeButton(nodeName: string, element: HTMLButtonElement | null) {
      if (element) nodeButtons.current.set(nodeName, element);
      else nodeButtons.current.delete(nodeName);
    },
  }), [
    choices, closeNode, clusterFrame, dataUpdatedAt, refresh, refreshIntervalSeconds, selectNode, selectedClusterExists,
    clusterScope.selectCluster, clusterScope.selection,
    selectedClusterId, selectedNodeName,
  ]);
}
