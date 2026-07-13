import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
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
  choices: HomeResourceState<HomeClusterChoices>;
  clusterAccess: HomeClusterAccess;
  overview: HomeResourceState<HomeClusterOverview>;
  nodes: HomeResourceState<HomeNodeCollection>;
  pods: HomeResourceState<HomePodCollection>;
  selectedClusterId: string | null;
  selectedNodeName: string | null;
  selectedNodeResolution: HomeSelectedNodeResolution;
  selectedClusterExists: boolean;
  refresh: () => void;
  selectCluster: (clusterId: string) => void;
  selectNode: (nodeName: string) => void;
  closeNode: () => void;
  registerNodeButton: (nodeName: string, element: HTMLButtonElement | null) => void;
}

export function useHomePageState(port: HomePort): HomePageState {
  const { reportUnauthorized } = useAuthSessionGate();
  const clusterScope = useClusterScope();
  const refreshClusterScope = clusterScope.refresh;
  const [searchParams, setSearchParams] = useSearchParams();
  const choices = clusterScope.collection;
  const nodeButtons = useRef(new Map<string, HTMLButtonElement>());
  const restoreNodeFocus = useRef<string | null>(null);
  const focusPodHeading = useRef(false);
  const selectedClusterId = clusterScope.requestedClusterId;
  const selectedNodeName = searchParams.get("node");
  const { refresh: refreshFrame, revision } = useHomeRefreshClock(true);
  const selectedClusterExists = clusterScope.selectedClusterExists;
  const scopeKey = clusterScope.scopeKey;
  const clusterFrame = useHomeClusterFrame({
    clusterId: selectedClusterExists ? selectedClusterId : null,
    port,
    refreshRevision: revision,
    reportUnauthorized,
    scopeKey,
    selectedNodeName,
  });

  useEffect(() => {
    if (!focusPodHeading.current || !selectedNodeName || clusterFrame.pods.phase === "idle") return;
    const heading = document.getElementById("pod-list-title");
    if (!heading) return;
    focusPodHeading.current = false;
    heading.focus();
  }, [clusterFrame.pods.phase, selectedNodeName]);

  const updateNodeSelection = useCallback((nodeName?: string) => {
    const next = new URLSearchParams(searchParams);
    if (nodeName) next.set("node", nodeName);
    else next.delete("node");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

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
    refreshClusterScope();
    refreshFrame();
  }, [refreshClusterScope, refreshFrame]);

  return useMemo(() => ({
    choices,
    ...clusterFrame,
    selectedClusterId,
    selectedNodeName,
    selectedClusterExists,
    refresh,
    selectCluster: clusterScope.selectCluster,
    selectNode,
    closeNode,
    registerNodeButton(nodeName: string, element: HTMLButtonElement | null) {
      if (element) nodeButtons.current.set(nodeName, element);
      else nodeButtons.current.delete(nodeName);
    },
  }), [
    choices, closeNode, clusterFrame, refresh, selectNode, selectedClusterExists,
    clusterScope.selectCluster,
    selectedClusterId, selectedNodeName,
  ]);
}
