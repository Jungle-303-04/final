import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";

import type {
  PhysicalTopologyRealtimePort,
  PhysicalTopologyRealtimeStreamPolicy,
} from "../../features/resources/physicalTopologyRealtimeContract";
import type { ResourceSummary } from "../../features/resources/resourcesContract";
import {
  ResourceTimelineModel,
  podTimelineIdentity,
} from "../../features/resource-timeline";
import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import {
  createRafStreamCoalescer,
  type RafStreamCoalescer,
} from "../../shared/streaming/rafStreamCoalescer";
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
  const reducedMotion = usePrefersReducedMotion();
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
    const captured = timeline.captureActualView(
      clusterId,
      frame.data.pods,
      rows,
      frame.data.servers,
      frame.data.metricsObservedAt,
    );
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
    let activePolicy: PhysicalTopologyRealtimeStreamPolicy | null = null;
    let coalescer: RafStreamCoalescer<unknown> | null = null;
    let coalescerAbort: AbortController | null = null;
    let resyncQueued = false;
    const initiallyVisible = document.visibilityState !== "hidden";
    queueMicrotask(() => {
      if (disposed) return;
      setOverlay(createRealtimeOverlay(
        scope,
        initiallyVisible ? "connecting" : "disconnected",
      ));
    });
    const open = () => {
      if (disposed || disconnect !== null || document.visibilityState === "hidden") return;
      disconnect = port.connect({ workspaceId, clusterId }, handlers);
    };
    const close = () => {
      const activeDisconnect = disconnect;
      disconnect = null;
      activeDisconnect?.();
    };
    const discardPendingFrame = () => {
      coalescerAbort?.abort();
      coalescerAbort = null;
      coalescer = null;
      activePolicy = null;
    };
    const requestResync = () => {
      if (disposed || resyncQueued) return;
      resyncQueued = true;
      discardPendingFrame();
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
        resyncQueued = false;
        close();
        open();
      });
    };
    const flushFrame = (messages: readonly unknown[]) => {
      if (disposed || messages.length === 0) return;
      let accepted = false;
      const actualView = currentActualView();
      for (const message of messages) {
        const ingest = timeline.ingest(message);
        if (ingest.resyncRequired) {
          requestResync();
          return;
        }
        accepted ||= ingest.accepted;
        if (ingest.accepted && actualView.frame.phase === "ready") {
          // Samples retain the exact graph/table cut that was current at their
          // own server revision, even when several records share one paint.
          timeline.captureActualView(
            clusterId,
            actualView.frame.data.pods,
            actualView.rows,
            actualView.frame.data.servers,
            actualView.frame.data.metricsObservedAt,
          );
        }
      }
      const requestedReplayAt = currentReplayAt();
      if (requestedReplayAt !== undefined && timeline.getCursor().mode === "live") {
        try {
          timeline.setReplayCursor(requestedReplayAt);
        } catch {
          // Keep waiting for the first real sample at this scope.
        }
      }
      if (accepted) setTimelineRevision((current) => current + 1);
      setOverlay((current) => {
        if (current.scope !== scope) return current;
        const next = messages.reduce<RealtimeOverlay>(
          (reduced, message) => reducePhysicalTopologyRealtimeOverlay(reduced, message, clusterId),
          current,
        );
        syncTimelineConnection(timeline, next.live);
        return next;
      });
    };
    const configurePolicy = (policy: PhysicalTopologyRealtimeStreamPolicy) => {
      discardPendingFrame();
      if (!validStreamPolicy(policy)) {
        requestResync();
        return;
      }
      try {
        const controller = new AbortController();
        coalescerAbort = controller;
        activePolicy = policy;
        coalescer = createRafStreamCoalescer({
          // The hub sends an already ordered, server-revisioned stream. Keep
          // that FIFO order intact so ResourceTimelineModel can detect a bad
          // revision rather than silently dropping it in the paint scheduler.
          onFlush: flushFrame,
          policy,
          reducedMotion,
          signal: controller.signal,
        });
      } catch {
        requestResync();
      }
    };
    const handlers = {
      onMessage(message) {
        if (disposed) return;
        if (coalescer === null || activePolicy === null) {
          requestResync();
          return;
        }
        if (coalescer.pendingCount() >= activePolicy.maxPendingMessages) {
          requestResync();
          return;
        }
        try {
          coalescer.enqueue(message);
        } catch {
          requestResync();
        }
      },
      onPolicy: configurePolicy,
      onStatusChange(connectionStatus) {
        if (disposed) return;
        const status = toPhysicalTopologyLiveStatus(connectionStatus);
        if (status === null) return;
        if (status === "reconnecting" || status === "disconnected") {
          // A lifecycle boundary may arrive before rAF. Publish its admitted
          // records once, then require the next hello/snapshot policy cut.
          coalescer?.flush();
          discardPendingFrame();
        }
        setOverlay((current) => {
          if (current.scope !== scope) return current;
          const next = { ...current, live: { ...current.live, status } };
          syncTimelineConnection(timeline, next.live);
          return next;
        });
      },
    } satisfies Parameters<PhysicalTopologyRealtimePort["connect"]>[1];
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        close();
        discardPendingFrame();
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
      discardPendingFrame();
      close();
    };
  }, [clusterId, port, reducedMotion, scope, timeline, workspaceId]);

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

function validStreamPolicy(
  policy: PhysicalTopologyRealtimeStreamPolicy,
): boolean {
  return Number.isSafeInteger(policy.revision)
    && policy.revision > 0
    && Number.isSafeInteger(policy.maxPendingMessages)
    && policy.maxPendingMessages > 0;
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
  const serverTopology = timeline.selectServerTopology(
    clusterId,
    frame.data.servers,
    frame.data.metricsObservedAt,
  );
  return {
    ...frame,
    data: {
      ...frame.data,
      pods: replay && cursor.mode !== "replay"
        ? []
        : timeline.selectGraphPods(clusterId, frame.data.pods),
      servers: replay && cursor.mode !== "replay"
        ? []
        : serverTopology.servers,
      metricsObservedAt: replay && cursor.mode !== "replay"
        ? null
        : serverTopology.observedAt,
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
