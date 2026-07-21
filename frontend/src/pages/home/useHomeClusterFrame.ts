import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { HomePort } from "../../features/home/homeContract";
import { acquireHomeRequest } from "./homeRequest";
import {
  EMPTY_HOME_FRAME,
  forbidClusterFrame,
  HOME_ALLOWED,
  HOME_IDLE,
  HOME_LOADING,
  isAbortError,
  isCurrentFrame,
  isValidNodeName,
  resourceFailure,
  resourceSuccess,
  startClusterFrame,
  startResource,
  toHomeFailure,
  type HomeClusterFrame,
  type HomeResourceState,
  type HomeSelectedNodeResolution,
} from "./homePageStateModel";

interface HomeClusterFrameInput {
  clusterId: string | null;
  port: HomePort;
  podRefreshRevision: number;
  refreshRevision: number;
  reportUnauthorized: () => void;
  scopeKey: string | null;
  selectedNodeName: string | null;
}

export function useHomeClusterFrame(input: HomeClusterFrameInput) {
  const {
    clusterId,
    port,
    podRefreshRevision,
    refreshRevision,
    reportUnauthorized,
    scopeKey,
    selectedNodeName,
  } = input;
  const [frame, setFrame] = useState<HomeClusterFrame>(EMPTY_HOME_FRAME);

  useEffect(() => {
    if (!clusterId || !scopeKey) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setFrame((current) => startClusterFrame(current, scopeKey, refreshRevision));
    });
    const overviewRequest = acquireHomeRequest(
      port,
      `overview:${scopeKey}:r${refreshRevision}`,
      (signal) => port.loadClusterOverview(clusterId, signal),
    );
    const nodesRequest = acquireHomeRequest(
      port,
      `nodes:${scopeKey}:r${refreshRevision}`,
      (signal) => port.loadNodes(clusterId, signal),
    );
    settleFrameRequest({
      active: () => active,
      promise: overviewRequest.promise,
      reportUnauthorized,
      revision: refreshRevision,
      scopeKey,
      section: "overview",
      setFrame,
    });
    settleFrameRequest({
      active: () => active,
      promise: nodesRequest.promise,
      reportUnauthorized,
      revision: refreshRevision,
      scopeKey,
      section: "nodes",
      setFrame,
    });
    return () => {
      active = false;
      overviewRequest.release();
      nodesRequest.release();
    };
  }, [clusterId, port, refreshRevision, reportUnauthorized, scopeKey]);

  const currentFrame = frame.scopeKey === scopeKey ? frame : null;
  const nodes = currentFrame?.nodes ?? (scopeKey ? HOME_LOADING : HOME_IDLE);
  const validNode = selectedNodeName !== null && isValidNodeName(selectedNodeName);

  useEffect(() => {
    if (!clusterId || !scopeKey || !selectedNodeName || !validNode) {
      queueMicrotask(() => {
        setFrame((current) => current.scopeKey === scopeKey
          ? { ...current, podKey: null, pods: HOME_IDLE }
          : current);
      });
      return;
    }
    if (nodes.phase !== "ready") return;
    let active = true;
    const podKey = `${scopeKey}:${selectedNodeName}`;
    queueMicrotask(() => {
      if (!active) return;
      setFrame((current) => {
        if (!isCurrentFrame(current, scopeKey, refreshRevision)) return current;
        return {
          ...current,
          podKey,
          pods: current.podKey === podKey ? startResource(current.pods) : HOME_LOADING,
        };
      });
    });
    const request = acquireHomeRequest(
      port,
      `pods:${podKey}:r${refreshRevision}:p${podRefreshRevision}`,
      (signal) => port.loadNodePods(clusterId, selectedNodeName, signal),
    );
    settleFrameRequest({
      active: () => active,
      podKey,
      promise: request.promise,
      reportUnauthorized,
      revision: refreshRevision,
      scopeKey,
      section: "pods",
      setFrame,
    });
    return () => {
      active = false;
      request.release();
    };
  }, [
    clusterId, nodes, podRefreshRevision, port, refreshRevision, reportUnauthorized, scopeKey,
    selectedNodeName, validNode,
  ]);

  const overview = currentFrame?.overview ?? (scopeKey ? HOME_LOADING : HOME_IDLE);
  const pods = currentFrame?.pods ?? (selectedNodeName ? HOME_LOADING : HOME_IDLE);
  const selectedNodeResolution = useMemo<HomeSelectedNodeResolution>(() => {
    if (!selectedNodeName) return "none";
    if (!validNode) return "invalid";
    if (pods.phase === "failed" && pods.failure.code === "not-found") return "unknown";
    if (pods.phase === "ready") return "known";
    if (nodes.phase === "ready" && nodes.data.nodes.some(
      (node) => node.name === selectedNodeName,
    )) return "known";
    return "resolving";
  }, [nodes, pods, selectedNodeName, validNode]);

  return {
    clusterAccess: currentFrame?.clusterAccess ?? HOME_ALLOWED,
    nodes,
    overview,
    pods,
    selectedNodeResolution,
  };
}

type FrameSection = "overview" | "nodes" | "pods";
type FrameData<K extends FrameSection> = HomeClusterFrame[K] extends HomeResourceState<infer T>
  ? T
  : never;

interface SettleFrameInput<K extends FrameSection> {
  active: () => boolean;
  podKey?: string;
  promise: Promise<FrameData<K>>;
  reportUnauthorized: () => void;
  revision: number;
  scopeKey: string;
  section: K;
  setFrame: Dispatch<SetStateAction<HomeClusterFrame>>;
}

function settleFrameRequest<K extends FrameSection>(input: SettleFrameInput<K>) {
  const { active, podKey, promise, reportUnauthorized, revision, scopeKey, section, setFrame } = input;
  void promise.then(
    (data) => {
      if (!active()) return;
      setFrame((current) => {
        if (!isCurrentFrame(current, scopeKey, revision)) return current;
        if (podKey && current.podKey !== podKey) return current;
        return { ...current, [section]: resourceSuccess(data) } as HomeClusterFrame;
      });
    },
    (error: unknown) => {
      if (!active() || isAbortError(error)) return;
      const failure = toHomeFailure(error);
      if (failure.code === "unauthorized") {
        reportUnauthorized();
        return;
      }
      setFrame((current) => {
        if (!isCurrentFrame(current, scopeKey, revision)) return current;
        if (podKey && current.podKey !== podKey) return current;
        if (failure.code === "forbidden") return forbidClusterFrame(current, failure);
        const currentSection = current[section] as HomeResourceState<FrameData<K>>;
        return {
          ...current,
          [section]: resourceFailure(currentSection, failure),
        } as HomeClusterFrame;
      });
    },
  );
}
