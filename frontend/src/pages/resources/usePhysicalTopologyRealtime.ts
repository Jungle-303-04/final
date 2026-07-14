import { useEffect, useMemo, useState } from "react";

import type { PhysicalTopologyRealtimePort } from "../../features/resources/physicalTopologyRealtimeContract";
import { mergePhysicalTopologyRealtime } from "./mergePhysicalTopologyRealtime";
import {
  createRealtimeOverlay,
  reducePhysicalTopologyRealtimeOverlay,
  toPhysicalTopologyLiveStatus,
  type PhysicalTopologyLiveState,
  type RealtimeOverlay,
} from "./physicalTopologyRealtimeModel";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";

export type { PhysicalTopologyLiveState } from "./physicalTopologyRealtimeModel";

export interface PhysicalTopologyRealtimeResult {
  frame: PhysicalTopologyFrame;
  live: PhysicalTopologyLiveState;
}

export function usePhysicalTopologyRealtime(input: {
  active: boolean;
  clusterId: string | null;
  frame: PhysicalTopologyFrame;
  port: PhysicalTopologyRealtimePort;
  workspaceId: string | null;
}): PhysicalTopologyRealtimeResult {
  const { active, clusterId, frame, port, workspaceId } = input;
  const scope = active && clusterId && workspaceId
    ? `${workspaceId}:${clusterId}`
    : null;
  const [overlay, setOverlay] = useState<RealtimeOverlay>(() => createRealtimeOverlay(null));

  useEffect(() => {
    if (scope === null || clusterId === null || workspaceId === null) return undefined;
    let disposed = false;
    let disconnect: (() => void) | null = null;
    const initiallyVisible = document.visibilityState !== "hidden";
    queueMicrotask(() => {
      if (disposed) return;
      setOverlay(createRealtimeOverlay(
        scope,
        initiallyVisible ? "connecting" : "disconnected",
      ));
    });
    const handlers = {
      onMessage(message) {
        if (disposed) return;
        setOverlay((current) => current.scope === scope
          ? reducePhysicalTopologyRealtimeOverlay(current, message, clusterId)
          : current);
      },
      onStatusChange(connectionStatus) {
        if (disposed) return;
        const status = toPhysicalTopologyLiveStatus(connectionStatus);
        if (status === null) return;
        setOverlay((current) => current.scope === scope
          ? { ...current, live: { ...current.live, status } }
          : current);
      },
    } satisfies Parameters<PhysicalTopologyRealtimePort["connect"]>[1];
    const open = () => {
      if (disposed || disconnect !== null || document.visibilityState === "hidden") return;
      disconnect = port.connect({ workspaceId, clusterId }, handlers);
    };
    const close = () => {
      const activeDisconnect = disconnect;
      disconnect = null;
      activeDisconnect?.();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        close();
        setOverlay((current) => current.scope === scope
          ? { ...current, live: { ...current.live, status: "disconnected" } }
          : current);
        return;
      }
      setOverlay((current) => current.scope === scope
        ? { ...current, live: { ...current.live, status: "connecting" } }
        : current);
      open();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    open();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      close();
    };
  }, [clusterId, port, scope, workspaceId]);

  const scopedOverlay = overlay.scope === scope
    ? overlay
    : createRealtimeOverlay(scope, scope === null ? "idle" : "connecting");
  const mergedFrame = useMemo(
    () => mergePhysicalTopologyRealtime(frame, scopedOverlay.pods),
    [frame, scopedOverlay.pods],
  );
  return { frame: mergedFrame, live: scopedOverlay.live };
}
