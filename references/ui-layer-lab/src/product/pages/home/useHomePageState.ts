import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import {
  type HomeClusterChoices,
  type HomeClusterOverview,
  type HomeNodeCollection,
  type HomePodCollection,
  type HomePort,
} from "../../features/home/homeContract";
import { selectInitialClusterChoice } from "../../features/home/homeSelection";
import { acquireHomeRequest } from "./homeRequest";
import {
  HOME_LOADING,
  isAbortError,
  resourceFailure,
  resourceSuccess,
  startResource,
  toHomeFailure,
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
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [choices, setChoices] = useState<HomeResourceState<HomeClusterChoices>>(HOME_LOADING);
  const nodeButtons = useRef(new Map<string, HTMLButtonElement>());
  const restoreNodeFocus = useRef<string | null>(null);
  const focusPodHeading = useRef(false);
  const selectedClusterId = searchParams.get("cluster");
  const selectedNodeName = searchParams.get("node");
  const { refresh, revision } = useHomeRefreshClock(true);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setChoices((current) => startResource(current));
    });
    const request = acquireHomeRequest(port, `cluster-choices:r${revision}`, (signal) => (
      port.listClusterChoices(signal)
    ));
    void request.promise.then(
      (data) => { if (active) setChoices(resourceSuccess(data)); },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        const failure = toHomeFailure(error);
        if (failure.code === "unauthorized") reportUnauthorized();
        else if (failure.code === "forbidden") {
          setChoices({ phase: "failed", data: null, failure });
        } else setChoices((current) => resourceFailure(current, failure));
      },
    );
    return () => {
      active = false;
      request.release();
    };
  }, [port, reportUnauthorized, revision]);

  useEffect(() => {
    if (choices.phase !== "ready" || selectedClusterId !== null) return;
    const initialCluster = selectInitialClusterChoice(choices.data.clusters);
    if (!initialCluster) return;
    const next = new URLSearchParams(searchParams);
    next.set("cluster", initialCluster.id);
    next.delete("node");
    setSearchParams(next, {
      replace: true,
      state: homeLocationState(initialCluster.id, `${location.key}:${initialCluster.id}`),
    });
  }, [choices, location.key, searchParams, selectedClusterId, setSearchParams]);

  const selectedClusterExists = choices.phase === "ready" && selectedClusterId !== null &&
    choices.data.clusters.some((cluster) => cluster.id === selectedClusterId);
  const inheritedScope = readHomeScope(location.state, selectedClusterId);
  const scopeSeed = inheritedScope ?? location.key;
  const scopeKey = selectedClusterExists && selectedClusterId
    ? `${selectedClusterId}:${scopeSeed}`
    : null;
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

  const updateSelection = useCallback((clusterId: string, nodeName?: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("cluster", clusterId);
    if (nodeName) next.set("node", nodeName);
    else next.delete("node");
    const nextScope = clusterId === selectedClusterId
      ? scopeSeed
      : `${location.key}:${clusterId}`;
    setSearchParams(next, { state: homeLocationState(clusterId, nextScope) });
  }, [location.key, scopeSeed, searchParams, selectedClusterId, setSearchParams]);

  const selectNode = useCallback((nodeName: string) => {
    if (!selectedClusterId) return;
    focusPodHeading.current = true;
    updateSelection(selectedClusterId, nodeName);
  }, [selectedClusterId, updateSelection]);

  const closeNode = useCallback(() => {
    if (!selectedClusterId || !selectedNodeName) return;
    restoreNodeFocus.current = selectedNodeName;
    updateSelection(selectedClusterId);
    requestAnimationFrame(() => {
      const nodeName = restoreNodeFocus.current;
      restoreNodeFocus.current = null;
      if (nodeName) nodeButtons.current.get(nodeName)?.focus();
    });
  }, [selectedClusterId, selectedNodeName, updateSelection]);

  return useMemo(() => ({
    choices,
    ...clusterFrame,
    selectedClusterId,
    selectedNodeName,
    selectedClusterExists,
    refresh,
    selectCluster: updateSelection,
    selectNode,
    closeNode,
    registerNodeButton(nodeName: string, element: HTMLButtonElement | null) {
      if (element) nodeButtons.current.set(nodeName, element);
      else nodeButtons.current.delete(nodeName);
    },
  }), [
    choices, closeNode, clusterFrame, refresh, selectNode, selectedClusterExists,
    selectedClusterId, selectedNodeName, updateSelection,
  ]);
}

interface HomeLocationState {
  homeClusterId: string;
  homeClusterScope: string;
}

function homeLocationState(clusterId: string, scope: string): HomeLocationState {
  return { homeClusterId: clusterId, homeClusterScope: scope };
}

function readHomeScope(value: unknown, clusterId: string | null): string | null {
  if (!value || typeof value !== "object" || clusterId === null) return null;
  if (!("homeClusterId" in value) || value.homeClusterId !== clusterId) return null;
  if (!("homeClusterScope" in value) || typeof value.homeClusterScope !== "string") return null;
  return value.homeClusterScope;
}
