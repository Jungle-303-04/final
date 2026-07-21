import { useEffect, useState } from "react";

import { getChangeTimeline } from "../api/change-timeline";
import type { ChangeTimelineEndpoint } from "../api/change-timeline-schemas";

// UI-PHASE2-001 §2 "Timeline": typed live adapter for the /timeline surface.
// Reads `GET /api/changes` for a fixed trailing window — the server returns
// real bucketed change activity plus ordered change events (inventory events,
// incidents, deployments, gitops changes). Only server-returned events render;
// an empty window is an honest "관측된 변경 없음" and a load failure is an honest
// `unavailable`, never the retired hard-coded fixture.

export type ChangeTimelineStatus = "loading" | "ready" | "unavailable";

export type ChangeEventView = ChangeTimelineEndpoint["events"][number];
export type ChangeBucketView = ChangeTimelineEndpoint["buckets"][number];

export interface ChangeTimelineFeed {
  status: ChangeTimelineStatus;
  events: ChangeEventView[];
  buckets: ChangeBucketView[];
  /** Retained-coverage gaps reported by the server, honestly surfaced. */
  gaps: ChangeTimelineEndpoint["gaps"];
  windowFromMs: number;
  windowToMs: number;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;
const BUCKET_MS = 60 * 60 * 1000;

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

/**
 * Reads the live change timeline over a trailing 24h window. The window is
 * pinned once at mount so the effect deps stay stable and a re-render cannot
 * silently re-query a shifted window.
 */
export function useChangeTimeline(): ChangeTimelineFeed {
  const [toMs] = useState(() => Date.now());
  const fromMs = toMs - WINDOW_MS;
  const [feed, setFeed] = useState<ChangeTimelineFeed>({
    status: "loading",
    events: [],
    buckets: [],
    gaps: [],
    windowFromMs: fromMs,
    windowToMs: toMs,
  });
  useEffect(() => {
    const controller = new AbortController();
    void getChangeTimeline({ fromMs, toMs, bucketMs: BUCKET_MS }, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setFeed({
          status: "ready",
          events: response.events,
          buckets: response.buckets,
          gaps: response.gaps,
          windowFromMs: fromMs,
          windowToMs: toMs,
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setFeed((prev) => ({ ...prev, status: "unavailable", events: [], buckets: [], gaps: [] }));
      });
    return () => controller.abort();
  }, [fromMs, toMs]);
  return feed;
}
