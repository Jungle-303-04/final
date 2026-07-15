import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import {
  TimelineFailure,
  type TimelineCoverage,
  type TimelinePort,
  type TimelineQuery,
  type TimelineSnapshot,
  type TimelineStreamFrame,
  type TimelineStreamLifecycle,
} from "../../features/timeline/timelineContract";
import { createRafStreamCoalescer } from "../../shared/streaming/rafStreamCoalescer";

export type TimelineDataFrame =
  | { phase: "loading" }
  | { phase: "ready"; snapshot: TimelineSnapshot; stream: TimelineStreamLifecycle }
  | { phase: "resyncing"; snapshot: TimelineSnapshot; reason: string }
  | { phase: "failed"; failure: TimelineFailure };

export interface TimelineDataController {
  frame: TimelineDataFrame;
  retry: () => void;
}

interface TimelineDataRecord {
  queryKey: string | null;
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
  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const [revision, setRevision] = useState(0);
  const requestKey = `${queryKey}:${revision}`;
  const [record, setRecord] = useState<TimelineDataRecord>(() => ({
    queryKey: null,
    requestKey: null,
    frame: { phase: "loading" },
  }));
  const frame: TimelineDataFrame = record.requestKey === requestKey || (
    record.queryKey === queryKey && record.frame.phase === "resyncing"
  ) ? record.frame : { phase: "loading" };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void open();
    return () => {
      active = false;
      controller.abort();
    };

    async function open() {
      let snapshot: TimelineSnapshot;
      try {
        snapshot = await port.readTimeline(query, controller.signal);
      } catch (error) {
        if (!active || isAbortError(error)) return;
        setRecord({
          queryKey,
          requestKey,
          frame: { phase: "failed", failure: toTimelineFailure(error) },
        });
        return;
      }
      if (!active) return;
      setRecord({
        queryKey,
        requestKey,
        frame: { phase: "ready", snapshot, stream: { state: "connecting" } },
      });

      const coalescer = createRafStreamCoalescer<TimelineStreamFrame>({
        opaqueCursor: {
          keyOf: (streamFrame) => `${streamFrame.kind}:${streamFrame.cursor.token}`,
        },
        onFlush: (frames) => {
          if (!active) return;
          const resync = frames.find((streamFrame) => streamFrame.kind === "resync_required");
          if (resync?.kind === "resync_required") {
            startTransition(() => {
              setRecord((current) => current.requestKey === requestKey && current.frame.phase === "ready"
                ? {
                  queryKey,
                  requestKey: current.requestKey,
                  frame: { phase: "resyncing", snapshot: current.frame.snapshot, reason: resync.reason },
                }
                : current);
              setRevision((current) => current + 1);
            });
            return;
          }
          startTransition(() => {
            setRecord((current) => reduceTimelineFrames(current, queryKey, requestKey, frames));
          });
        },
        policy: {
          hiddenTab: snapshot.policy.hiddenTab,
          maxFramesPerSecond: snapshot.policy.maxFramesPerSecond,
        },
        signal: controller.signal,
      });
      try {
        for await (const streamFrame of port.subscribeTimeline(snapshot.session, {
          signal: controller.signal,
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
        coalescer.dispose();
      }
    }
  }, [port, query, queryKey, requestKey]);

  const retry = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);
  return { frame, retry };
}

function reduceTimelineFrames(
  record: TimelineDataRecord,
  queryKey: string,
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
  const events = frames.flatMap((frame) => frame.kind === "event" ? [frame.event] : []);
  const coverage = frames.flatMap((frame) => frame.kind === "coverage" ? frame.coverage : []);
  if (events.length === 0 && coverage.length === 0) return record;
  return {
    queryKey,
    requestKey,
    frame: {
      ...record.frame,
      snapshot: {
        ...record.frame.snapshot,
        coverage: mergeCoverage(record.frame.snapshot.coverage, coverage),
        events: [...record.frame.snapshot.events, ...events],
      },
    },
  };
}

function mergeCoverage(
  current: readonly TimelineCoverage[],
  incoming: readonly TimelineCoverage[],
): readonly TimelineCoverage[] {
  const known = new Set(current.map(coverageKey));
  const additions = incoming.filter((coverage) => {
    const key = coverageKey(coverage);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  return additions.length === 0 ? current : [...current, ...additions];
}

function coverageKey(coverage: TimelineCoverage): string {
  return [
    coverage.scope.workspaceId,
    coverage.scope.clusterId,
    (coverage.scope.namespaces ?? []).join("\u0000"),
    coverage.source,
    coverage.fromMs,
    coverage.toMs,
    coverage.reason,
  ].join("\u0000");
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
