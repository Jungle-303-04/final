import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";

import type { PhysicalTopologyRealtimePort } from "../../features/resources/physicalTopologyRealtimeContract";
import type { ResourceSummary } from "../../features/resources/resourcesContract";
import {
  ResourceTimelineModel,
  podTimelineIdentity,
} from "../../features/resource-timeline";
import type { ResourceMetricLiveSeries } from "./resourceMetricLiveSeries";
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
  replay: PhysicalTopologyReplayState;
  metricSeries: readonly ResourceMetricLiveSeries[];
  selectTableRows: (rows: readonly ResourceSummary[]) => ResourceSummary[];
}

export interface PhysicalTopologyReplayState {
  requestedAtMs: number | null;
  selectedAt: string | null;
  status: "live" | "ready" | "gap";
  availableFromMs: number | null;
  availableToMs: number | null;
  blockedReason: "sequence-integrity" | "removal-time-unavailable" | "empty-buffer" | null;
}

const EMPTY_RESOURCE_ROWS: readonly ResourceSummary[] = [];

export function usePhysicalTopologyRealtime(input: {
  active: boolean;
  clusterId: string | null;
  frame: PhysicalTopologyFrame;
  port: PhysicalTopologyRealtimePort;
  replayAtMs?: number;
  rows?: readonly ResourceSummary[];
  workspaceId: string | null;
}): PhysicalTopologyRealtimeResult {
  const { active, clusterId, frame, port, replayAtMs, workspaceId } = input;
  const rows = input.rows ?? EMPTY_RESOURCE_ROWS;
  const scope = active && clusterId && workspaceId
    ? `${workspaceId}:${clusterId}`
    : null;
  const [overlay, setOverlay] = useState<RealtimeOverlay>(() => createRealtimeOverlay(null));
  const [timelineRevision, setTimelineRevision] = useState(0);
  const timeline = useMemo(() => createResourceTimeline(scope), [scope]);
  const currentReplayAt = useEffectEvent(() => replayAtMs);
  const currentActualView = useEffectEvent(() => ({ frame, rows }));

  useEffect(() => {
    let disposed = false;
    if (replayAtMs === undefined) {
      timeline.setLiveCursor();
    } else {
      try {
        timeline.setReplayCursor(replayAtMs);
      } catch {
        // A requested historical point remains an explicit gap until a measured
        // sample arrives. Never substitute the current frame as fake history.
      }
    }
    queueMicrotask(() => {
      if (!disposed) setTimelineRevision((current) => current + 1);
    });
    return () => {
      disposed = true;
    };
  }, [replayAtMs, timeline]);

  useEffect(() => {
    if (clusterId === null || frame.phase !== "ready") return undefined;
    const captured = timeline.captureActualView(clusterId, frame.data.pods, rows);
    if (captured === 0) return undefined;
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) setTimelineRevision((current) => current + 1);
    });
    return () => {
      disposed = true;
    };
  }, [clusterId, frame, rows, timeline]);

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
        const ingest = timeline.ingest(message);
        if (ingest.resyncRequired) {
          setTimelineRevision((current) => current + 1);
          setOverlay((current) => current.scope === scope
            ? {
                ...current,
                live: {
                  ...current.live,
                  status: "reconnecting",
                  degradedReason: "stream-sequence-integrity",
                },
              }
            : current);
          queueMicrotask(() => {
            if (disposed) return;
            close();
            open();
          });
          return;
        }
        const actualView = currentActualView();
        if (clusterId !== null && actualView.frame.phase === "ready") {
          timeline.captureActualView(
            clusterId,
            actualView.frame.data.pods,
            actualView.rows,
          );
        }
        const requestedReplayAt = currentReplayAt();
        if (requestedReplayAt !== undefined && timeline.getCursor().mode === "live") {
          try {
            timeline.setReplayCursor(requestedReplayAt);
          } catch {
            // Keep waiting for the first real sample at this scope.
          }
        }
        if (ingest.accepted) {
          setTimelineRevision((current) => current + 1);
        }
        setOverlay((current) => {
          if (current.scope !== scope) return current;
          const next = reducePhysicalTopologyRealtimeOverlay(current, message, clusterId);
          syncTimelineConnection(timeline, next.live);
          return next;
        });
      },
      onStatusChange(connectionStatus) {
        if (disposed) return;
        const status = toPhysicalTopologyLiveStatus(connectionStatus);
        if (status === null) return;
        setOverlay((current) => {
          if (current.scope !== scope) return current;
          const next = { ...current, live: { ...current.live, status } };
          syncTimelineConnection(timeline, next.live);
          return next;
        });
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
  }, [clusterId, port, scope, timeline, workspaceId]);

  const scopedOverlay = overlay.scope === scope
    ? overlay
    : createRealtimeOverlay(scope, scope === null ? "idle" : "connecting");
  const liveFrame = useMemo(
    () => mergePhysicalTopologyRealtime(frame, scopedOverlay.pods),
    [frame, scopedOverlay.pods],
  );
  const replay = replayState(timeline, frame, clusterId, replayAtMs, timelineRevision);
  const selectedFrame = selectTimelineFrame(
    replayAtMs === undefined ? liveFrame : frame,
    timeline,
    clusterId,
    replayAtMs !== undefined,
    timelineRevision,
  );
  const selectTableRows = useCallback((currentRows: readonly ResourceSummary[]) => {
    void timelineRevision;
    if (replayAtMs !== undefined && timeline.getCursor().mode !== "replay") return [];
    return timeline.selectTableRows(currentRows);
  }, [replayAtMs, timeline, timelineRevision]);
  const metricSeries = useMemo(() => {
    void timelineRevision;
    return rows.flatMap((row): ResourceMetricLiveSeries[] => {
      if (row.facts.type !== "pod" || row.namespace === null) return [];
      const samples = timeline.getPodSamples(podTimelineIdentity({
        clusterId: row.clusterId,
        namespace: row.namespace,
        name: row.name,
      })).filter((sample) => sample.present && (
        sample.cpuMillicores !== undefined || sample.memoryMebibytes !== undefined
      )).map((sample) => ({
        observedAt: sample.observedAt,
        cpuMillicores: sample.cpuMillicores ?? null,
        memoryMebibytes: sample.memoryMebibytes ?? null,
      }));
      return samples.length === 0 ? [] : [{ resourceId: row.inventoryKey, points: samples }];
    });
  }, [rows, timeline, timelineRevision]);
  return {
    frame: selectedFrame,
    live: scopedOverlay.live,
    metricSeries,
    replay,
    selectTableRows,
  };
}

function createResourceTimeline(scope: string | null): ResourceTimelineModel {
  void scope;
  return new ResourceTimelineModel();
}

function selectTimelineFrame(
  frame: PhysicalTopologyFrame,
  timeline: ResourceTimelineModel,
  clusterId: string | null,
  replay: boolean,
  revision: number,
): PhysicalTopologyFrame {
  void revision;
  if (frame.phase !== "ready" || clusterId === null) return frame;
  const cursor = timeline.getCursor();
  return {
    ...frame,
    data: {
      ...frame.data,
      pods: replay && cursor.mode !== "replay"
        ? []
        : timeline.selectGraphPods(clusterId, frame.data.pods),
    },
  };
}

function replayState(
  timeline: ResourceTimelineModel,
  frame: PhysicalTopologyFrame,
  clusterId: string | null,
  replayAtMs: number | undefined,
  revision: number,
): PhysicalTopologyReplayState {
  void revision;
  if (replayAtMs === undefined) {
    const range = timeline.getAvailableRange();
    return {
      requestedAtMs: null,
      selectedAt: null,
      status: timeline.getCursor().mode === "live" ? "live" : "ready",
      availableFromMs: range?.fromMs ?? null,
      availableToMs: range?.toMs ?? null,
      blockedReason: range === null ? "empty-buffer" : null,
    };
  }
  const cursor = timeline.getCursor();
  const range = timeline.getAvailableRange();
  const sequence = timeline.getSequenceQuality();
  const removalTimeUnavailable = timeline.getPresentationState().degradedReasons
    .includes("resource-removal-time-unavailable");
  if (cursor.mode !== "replay" || frame.phase !== "ready" || clusterId === null) {
    return {
      requestedAtMs: replayAtMs,
      selectedAt: null,
      status: "gap",
      availableFromMs: range?.fromMs ?? null,
      availableToMs: range?.toMs ?? null,
      blockedReason: sequence.resyncRequired
        ? "sequence-integrity"
        : removalTimeUnavailable
          ? "removal-time-unavailable"
          : "empty-buffer",
    };
  }
  const hasMeasuredPod = timeline.hasReplayCoverage();
  return {
    requestedAtMs: replayAtMs,
    selectedAt: hasMeasuredPod ? cursor.at : null,
    status: hasMeasuredPod ? "ready" : "gap",
    availableFromMs: range?.fromMs ?? null,
    availableToMs: range?.toMs ?? null,
    blockedReason: hasMeasuredPod ? null : "empty-buffer",
  };
}

function syncTimelineConnection(
  timeline: ResourceTimelineModel,
  live: PhysicalTopologyLiveState,
): void {
  timeline.setConnectionState({
    status: live.status,
    actualIntervalSeconds: live.actualIntervalSeconds !== null && live.actualIntervalSeconds > 0
      ? live.actualIntervalSeconds
      : null,
    degradedReason: live.degradedReason,
    source: live.source,
  });
}
