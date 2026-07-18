import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
  TimelineFailure,
  type TimelinePort,
  type TimelineQuery,
  type TimelineSnapshot,
  type TimelineStreamFrame,
  type TimelineStreamLifecycle,
} from "../../features/timeline/timelineContract";
import { createRafStreamCoalescer } from "../../shared/streaming/rafStreamCoalescer";
import { timelineEvidenceKey } from "../../features/timeline/timelineEvidenceIdentity";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import { applyTimelineFrames, normalizeTimelineSnapshot } from "./timelineFrameReducer";

export type TimelineDataFrame =
  | { phase: "loading" }
  | { phase: "ready"; snapshot: TimelineSnapshot; stream: TimelineStreamLifecycle }
  | {
    phase: "resyncing";
    snapshot: TimelineSnapshot;
    reason: string;
    /** The retained snapshot remains usable while the replacement failed. */
    failure: TimelineFailure | null;
  }
  | { phase: "failed"; failure: TimelineFailure };

export interface TimelineDataController {
  frame: TimelineDataFrame;
  retry: () => void;
}

interface TimelineDataRecord {
  evidenceKey: string | null;
  requestKey: string | null;
  frame: TimelineDataFrame;
}

/**
 * Reads one retained snapshot then consumes its opaque SSE suffix. Incoming
 * frames are rendered only under the server's negotiated frame budget.
 */
export function useTimelineDataFrame(
  port: TimelinePort,
  query: TimelineQuery,
): TimelineDataController {
  const queryRef = useRef(query);
  const evidenceKey = timelineEvidenceKey(query);
  const [revision, setRevision] = useState(0);
  const requestKey = `${evidenceKey}:${revision}`;
  const [record, setRecord] = useState<TimelineDataRecord>(() => ({
    evidenceKey: null,
    requestKey: null,
    frame: { phase: "loading" },
  }));
  const recordRef = useRef(record);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  useEffect(() => {
    recordRef.current = record;
  }, [record]);
  const frame: TimelineDataFrame = record.requestKey === requestKey || (
    record.evidenceKey === evidenceKey && record.frame.phase === "resyncing"
  ) ? record.frame : { phase: "loading" };

  const beginRetainedResync = useCallback((reason: string, expectedRequestKey?: string) => {
    const current = recordRef.current;
    // A stream can ask for a resync immediately after the initial snapshot;
    // React has not necessarily committed that queued ready record yet.
    // Only discard a callback that demonstrably belongs to another evidence set.
    if (current.evidenceKey !== null && current.evidenceKey !== evidenceKey) return;
    startTransition(() => {
      setRecord((latest) => (
        latest.evidenceKey === evidenceKey
        && (expectedRequestKey === undefined || latest.requestKey === expectedRequestKey)
        && (latest.frame.phase === "ready" || latest.frame.phase === "resyncing")
          ? {
            evidenceKey,
            requestKey: latest.requestKey,
            frame: {
              phase: "resyncing",
              snapshot: latest.frame.snapshot,
              reason,
              failure: null,
            },
          }
          : latest
      ));
      setRevision((value) => value + 1);
    });
  }, [evidenceKey]);

  useEffect(() => {
    const streamController = new AbortController();
    let active = true;
    const sharedRequest = acquireSharedRequest(
      port,
      `timeline:snapshot:${requestKey}`,
      (signal) => port.readTimeline(queryRef.current, signal),
    );
    void open();
    return () => {
      active = false;
      sharedRequest.release();
      streamController.abort();
    };

    async function open() {
      let snapshot: TimelineSnapshot;
      try {
        snapshot = normalizeTimelineSnapshot(await sharedRequest.promise);
      } catch (error) {
        if (!active || isAbortError(error)) return;
        const failure = toTimelineFailure(error);
        setRecord((current) => (
          current.evidenceKey === evidenceKey && current.frame.phase === "resyncing"
            ? {
              evidenceKey,
              requestKey,
              frame: { ...current.frame, failure },
            }
            : {
              evidenceKey,
              requestKey,
              frame: { phase: "failed", failure },
            }
        ));
        return;
      }
      if (!active) return;
      setRecord({
        evidenceKey,
        requestKey,
        frame: { phase: "ready", snapshot, stream: { state: "connecting" } },
      });

      const liveSessionTimer = scheduleLiveSessionReplacement(
        snapshot,
        () => {
          if (!active) return;
          beginRetainedResync("live_session_rotation", requestKey);
        },
      );
      const coalescer = createRafStreamCoalescer<TimelineStreamFrame>({
        opaqueCursor: {
          keyOf: (streamFrame) => `${streamFrame.kind}:${streamFrame.cursor.token}`,
        },
        onFlush: (frames) => {
          if (!active) return;
          const resync = frames.find((streamFrame) => streamFrame.kind === "resync_required");
          if (resync?.kind === "resync_required") {
            beginRetainedResync(resync.reason, requestKey);
            return;
          }
          startTransition(() => {
            setRecord((current) => reduceTimelineFrames(current, evidenceKey, requestKey, frames));
          });
        },
        policy: {
          hiddenTab: snapshot.policy.hiddenTab,
          maxFramesPerSecond: snapshot.policy.maxFramesPerSecond,
        },
        signal: streamController.signal,
      });
      try {
        for await (const streamFrame of port.subscribeTimeline(snapshot.session, {
          signal: streamController.signal,
          onLifecycle: (lifecycle) => {
            if (!active) return;
            setRecord((current) => current.requestKey === requestKey && current.frame.phase === "ready"
              ? { ...current, frame: { ...current.frame, stream: lifecycle } }
              : current);
          },
        })) {
          coalescer.enqueue(streamFrame);
          if (streamFrame.kind === "resync_required" || streamFrame.kind === "error") {
            coalescer.flush();
            break;
          }
        }
      } catch (error) {
        if (!active || isAbortError(error)) return;
        setRecord((current) => current.requestKey === requestKey && current.frame.phase === "ready"
          ? {
            ...current,
            frame: {
              ...current.frame,
              stream: { state: "failed", failure: streamFailureFor(error) },
            },
          }
          : current);
      } finally {
        if (liveSessionTimer !== null) clearTimeout(liveSessionTimer);
        coalescer.dispose();
      }
    }
  }, [beginRetainedResync, port, evidenceKey, requestKey]);

  const retry = useCallback(() => {
    beginRetainedResync("manual_retry");
  }, [beginRetainedResync]);
  return { frame, retry };
}

function reduceTimelineFrames(
  record: TimelineDataRecord,
  evidenceKey: string,
  requestKey: string,
  frames: readonly TimelineStreamFrame[],
): TimelineDataRecord {
  if (record.requestKey !== requestKey || record.frame.phase !== "ready") return record;
  const terminalError = frames.find((frame) => frame.kind === "error");
  if (terminalError?.kind === "error") {
    return {
      ...record,
      frame: { ...record.frame, stream: { state: "failed", failure: "unavailable" } },
    };
  }
  if (!frames.some((frame) => frame.kind === "event" || frame.kind === "coverage")) return record;
  return {
    evidenceKey,
    requestKey,
    frame: {
      ...record.frame,
      snapshot: applyTimelineFrames(record.frame.snapshot, frames),
    },
  };
}

function scheduleLiveSessionReplacement(
  snapshot: TimelineSnapshot,
  replace: () => void,
): ReturnType<typeof setTimeout> | null {
  if (snapshot.session.query.mode.kind !== "live") return null;
  const policy = snapshot.policy.liveSession;
  if (policy.strategy !== "replace_with_snapshot") {
    throw new TimelineFailure("invalid-response");
  }
  return setTimeout(replace, policy.maxAgeMs);
}

function toTimelineFailure(error: unknown): TimelineFailure {
  return error instanceof TimelineFailure ? error : new TimelineFailure("unknown");
}

function streamFailureFor(error: unknown): "forbidden" | "invalid" | "unavailable" {
  if (error instanceof TimelineFailure && error.code === "forbidden") return "forbidden";
  if (error instanceof TimelineFailure && error.code === "invalid-response") return "invalid";
  return "unavailable";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && error.name === "AbortError";
}
