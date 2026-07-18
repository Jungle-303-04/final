import { useCallback, useEffect, useRef, useState } from "react";
import { timelineEvidenceKey } from "../../features/timeline/timelineEvidenceIdentity";
import {
  TimelineFailure,
  type TimelineOverview,
  type TimelinePort,
  type TimelineQuery,
} from "../../features/timeline/timelineContract";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";

export type TimelineOverviewFrame =
  { phase: "loading" } | { phase: "ready"; overview: TimelineOverview } | { phase: "failed"; failure: TimelineFailure };

export interface TimelineOverviewController {
  frame: TimelineOverviewFrame;
  retry: () => void;
}

interface TimelineOverviewRecord {
  requestKey: string | null;
  frame: TimelineOverviewFrame;
}

/**
 * Overview data has its own request lifecycle. It never joins the event SSE
 * stream or schedules polling, keeping 60fps event rendering independent of
 * facet and coverage metadata refreshes.
 */
export function useTimelineOverviewFrame(port: TimelinePort, query: TimelineQuery): TimelineOverviewController {
  const evidenceKey = timelineEvidenceKey(query);
  const queryRef = useRef(query);
  const [revision, setRevision] = useState(0);
  const requestKey = `${evidenceKey}:${revision}`;
  const [record, setRecord] = useState<TimelineOverviewRecord>({
    requestKey: null,
    frame: { phase: "loading" },
  });
  const frame: TimelineOverviewFrame = record.requestKey === requestKey ? record.frame : { phase: "loading" };

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    let active = true;
    const sharedRequest = acquireSharedRequest(
      port,
      `timeline:overview:${requestKey}`,
      (signal) => port.readTimelineOverview(queryRef.current, signal),
    );
    void sharedRequest.promise.then(
      (overview) => {
        if (!active) return;
        setRecord({ requestKey, frame: { phase: "ready", overview } });
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        setRecord({
          requestKey,
          frame: { phase: "failed", failure: toTimelineFailure(error) },
        });
      },
    );
    return () => {
      active = false;
      sharedRequest.release();
    };
  }, [port, requestKey]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { frame, retry };
}

function toTimelineFailure(error: unknown): TimelineFailure {
  return error instanceof TimelineFailure ? error : new TimelineFailure("unknown");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
