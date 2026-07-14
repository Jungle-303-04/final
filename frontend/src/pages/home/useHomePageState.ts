import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopeSelection } from "../../features/cluster-scope/clusterScopeContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import {
  type HomeClusterChoices,
  type HomeClusterOverview,
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
import { useHomeRefreshClock } from "./useHomeRefreshClock";

export type { HomeResourceState } from "./homePageStateModel";

export interface HomePageState {
  clusterSelection: ClusterScopeSelection;
  choices: HomeResourceState<HomeClusterChoices>;
  clusterAccess: HomeClusterAccess;
  overview: HomeResourceState<HomeClusterOverview>;
  nodes: HomeResourceState<HomeNodeCollection>;
  pods: HomeResourceState<HomePodCollection>;
  selectedClusterId: string | null;
  selectedNodeName: string | null;
  selectedNodeResolution: HomeSelectedNodeResolution;
  selectedClusterExists: boolean;
  dataUpdatedAt: number;
  refresh: () => void;
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
  const {
    refresh: refreshFrame,
    podRevision,
    summaryRevision,
  } = useHomeRefreshClock(true);
  const observedSummaryRevision = useRef(summaryRevision);
  const resumedFromBackground = useRef(false);
  const [dataUpdatedAt, setDataUpdatedAt] = useState(0);
  const selectedClusterExists = clusterScope.selectedClusterExists;
  const scopeKey = clusterScope.scopeKey;
  const clusterFrame = useHomeClusterFrame({
    clusterId: selectedClusterExists ? selectedClusterId : null,
    port,
    podRefreshRevision: podRevision,
    refreshRevision: summaryRevision,
    reportUnauthorized,
    scopeKey,
    selectedNodeName,
  });
  const choicesData = choices.phase === "ready" ? choices.data : null;
  const overviewData = clusterFrame.overview.phase === "ready"
    ? clusterFrame.overview.data
    : null;
  const nodesData = clusterFrame.nodes.phase === "ready"
    ? clusterFrame.nodes.data
    : null;
  const podsData = clusterFrame.pods.phase === "ready"
    ? clusterFrame.pods.data
    : null;

  useEffect(() => {
    if (observedSummaryRevision.current === summaryRevision) return;
    observedSummaryRevision.current = summaryRevision;
    if (resumedFromBackground.current) {
      resumedFromBackground.current = false;
      return;
    }
    refreshClusterScope();
  }, [refreshClusterScope, summaryRevision]);

  useEffect(() => {
    const rememberVisibilityResume = () => {
      if (document.visibilityState === "visible") resumedFromBackground.current = true;
    };
    document.addEventListener("visibilitychange", rememberVisibilityResume);
    return () => document.removeEventListener("visibilitychange", rememberVisibilityResume);
  }, []);

  useEffect(() => {
    const successfulData = [choicesData, overviewData, nodesData, podsData];
    if (successfulData.every((value) => value === null)) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setDataUpdatedAt(Date.now());
    });
    return () => {
      active = false;
    };
  }, [choicesData, nodesData, overviewData, podsData]);

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
    refreshFrame();
  }, [refreshFrame]);

  return useMemo(() => ({
    choices,
    clusterSelection: clusterScope.selection,
    ...clusterFrame,
    selectedClusterId,
    selectedNodeName,
    selectedClusterExists,
    dataUpdatedAt,
    refresh,
    selectCluster: clusterScope.selectCluster,
    selectNode,
    closeNode,
    registerNodeButton(nodeName: string, element: HTMLButtonElement | null) {
      if (element) nodeButtons.current.set(nodeName, element);
      else nodeButtons.current.delete(nodeName);
    },
  }), [
    choices, closeNode, clusterFrame, dataUpdatedAt, refresh, selectNode, selectedClusterExists,
    clusterScope.selectCluster, clusterScope.selection,
    selectedClusterId, selectedNodeName,
  ]);
}
