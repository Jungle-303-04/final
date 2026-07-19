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
  type HomeClusterAccess,
  type HomeResourceState,
  type HomeSelectedNodeResolution,
} from "./homePageStateModel";
import { useHomeClusterFrame } from "./useHomeClusterFrame";
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";

export type { HomeResourceState } from "./homePageStateModel";

export interface HomePageState {
  boardWindowAnchorMs: number;
  boardRefreshRevision: number;
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
  const [boardWindowAnchorMs, setBoardWindowAnchorMs] = useState(() => Date.now());
  const dashboardRefresh = useServerRefreshScheduler(
    () => {
      setBoardWindowAnchorMs(Date.now());
      setDashboardRevision((current) => current + 1);
    },
  );
  const observedDashboardRevision = useRef(dashboardRevision);
  const resumedFromBackground = useRef(false);
  const observedScopeInvalidation = useRef({ revision: 0, scopeKey: null as string | null });
  const [dataUpdatedAt, setDataUpdatedAt] = useState(0);
  const dashboardPolicy = clusterScope.dashboardRefreshPolicy;
  const refreshIntervalSeconds = dashboardPolicy?.refreshAfterSeconds ?? null;
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

    if (dashboardPolicy === null) return;
    dashboardRefresh.acceptSuccess(dashboardPolicy);
  }, [
    clusterFrame.nodes,
    clusterFrame.overview,
    clusterFrame.pods,
    dashboardRefresh,
    dashboardPolicy,
    scopeKey,
    selectedClusterExists,
    selectedNodeName,
  ]);

  useEffect(() => {
    const current = observedScopeInvalidation.current;
    if (current.scopeKey !== scopeKey) {
      observedScopeInvalidation.current = {
        revision: clusterScope.scopeInvalidationRevision,
        scopeKey,
      };
      return;
    }
    if (clusterScope.scopeInvalidationRevision <= current.revision) return;
    observedScopeInvalidation.current = {
      revision: clusterScope.scopeInvalidationRevision,
      scopeKey,
    };
    dashboardRefresh.requestEventInvalidation();
  }, [
    clusterScope.scopeInvalidationRevision,
    dashboardRefresh,
    scopeKey,
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
    boardWindowAnchorMs,
    boardRefreshRevision: dashboardRevision,
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
    boardWindowAnchorMs, choices, closeNode, clusterFrame, dashboardRevision, dataUpdatedAt, refresh, refreshIntervalSeconds, selectNode, selectedClusterExists,
    clusterScope.selectCluster, clusterScope.selection,
    selectedClusterId, selectedNodeName,
  ]);
}
