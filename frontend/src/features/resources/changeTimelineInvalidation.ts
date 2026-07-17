import type { UnifiedFilterState } from "../filters/filterContract";
import {
  TimelineFailure,
  timelineActivityKeysFromActivities,
  type TimelineCapabilities,
  type TimelineGrouping,
  type TimelinePort,
  type TimelineQuery,
  type TimelineSort,
  type TimelineViewMode,
} from "../timeline/timelineContract";
import type { ChangeTimelineOptions } from "./changeTimelineContract";

type TimelineInvalidationPort = Pick<
  TimelinePort,
  "readCapabilities" | "readTimeline" | "subscribeTimeline"
>;

export async function watchChangeTimelineInvalidations(input: {
  filterState: UnifiedFilterState;
  onInvalidate(): void;
  port: TimelineInvalidationPort;
  signal: AbortSignal;
  window: ChangeTimelineOptions;
  workspaceId: string;
}): Promise<void> {
  const { filterState, onInvalidate, port, signal, window, workspaceId } = input;
  const readCapabilities = port.readCapabilities;
  if (readCapabilities === undefined) {
    throw new TimelineFailure("invalid-response", "Timeline capability preflight is unavailable.");
  }
  const capabilities = await readCapabilities(signal, workspaceId);
  const query = changeTimelineInvalidationQuery({
    capabilities,
    filterState,
    window,
    workspaceId,
  });

  while (!signal.aborted) {
    const snapshot = await port.readTimeline(query, signal);
    if (signal.aborted) return;
    const sessionController = new AbortController();
    let replaceSession = false;
    const abortSession = () => sessionController.abort(signal.reason);
    signal.addEventListener("abort", abortSession, { once: true });
    const rotationTimer = setTimeout(() => {
      replaceSession = true;
      sessionController.abort("timeline_live_session_rotation");
    }, snapshot.policy.liveSession.maxAgeMs);
    try {
      for await (const frame of port.subscribeTimeline(snapshot.session, {
        signal: sessionController.signal,
      })) {
        if (frame.kind === "event" || frame.kind === "coverage") {
          onInvalidate();
          continue;
        }
        if (frame.kind === "resync_required") {
          onInvalidate();
          replaceSession = true;
          break;
        }
        if (frame.kind === "error") return;
      }
    } catch (error) {
      if (signal.aborted) return;
      if (!replaceSession || !isAbortError(error)) throw error;
    } finally {
      clearTimeout(rotationTimer);
      signal.removeEventListener("abort", abortSession);
      sessionController.abort();
    }
    if (!replaceSession) return;
  }
}

function changeTimelineInvalidationQuery(input: {
  capabilities: TimelineCapabilities;
  filterState: UnifiedFilterState;
  window: ChangeTimelineOptions;
  workspaceId: string;
}): TimelineQuery {
  const { capabilities, filterState, window } = input;
  const workspaceId = input.workspaceId.trim();
  const [clusterId] = filterState.common.clusters;
  if (!workspaceId || filterState.common.clusters.length !== 1 || !clusterId) {
    throw new TimelineFailure("invalid-request");
  }
  const controls = capabilities.controlSurface;
  if (!controls.activity.some((option) => option.activity.includes("change"))) {
    throw new TimelineFailure("invalid-response", "Timeline change activity is unavailable.");
  }
  const widthMs = window.toMs - window.fromMs;
  if (!Number.isSafeInteger(widthMs) || widthMs <= 0) {
    throw new TimelineFailure("invalid-request");
  }
  const view = firstView(controls.views.map((option) => option.id));
  const grouping = firstGrouping(controls.groupings.map((option) => option.id));
  const sort = firstSort(controls.sorts.map((option) => option.id));
  const rangeId = controls.timeRanges.find((option) => option.durationMs === widthMs)?.id
    ?? controls.customTimeRangeId;
  if (!controls.defaultLensZoomRung) throw new TimelineFailure("invalid-response");
  return {
    scopes: [{
      workspaceId,
      clusterId,
      namespaces: filterState.common.namespaces
        .filter((namespace) => namespace.clusterId === clusterId)
        .map((namespace) => namespace.namespace),
      // TimelineQuery normalizes this input placeholder from server-observed scope.
      freshness: "live",
    }],
    mode: { kind: "live", widthMs },
    control: {
      view,
      rangeId,
      lensZoomRung: controls.defaultLensZoomRung,
    },
    filters: {
      activity: timelineActivityKeysFromActivities(["change"]),
      kinds: filterState.resources.types,
      showDeleted: false,
      pinnedOnly: false,
      search: filterState.resources.query,
      grouping,
      sort,
      selectedEventKey: null,
    },
  };
}

function firstView(values: readonly string[]): TimelineViewMode {
  const value = values.find((candidate): candidate is TimelineViewMode => (
    candidate === "list" || candidate === "swimlane"
  ));
  if (value === undefined) throw new TimelineFailure("invalid-response");
  return value;
}

function firstGrouping(values: readonly string[]): TimelineGrouping {
  const value = values.find((candidate): candidate is TimelineGrouping => (
    candidate === "app" || candidate === "flat" || candidate === "owner"
  ));
  if (value === undefined) throw new TimelineFailure("invalid-response");
  return value;
}

function firstSort(values: readonly string[]): TimelineSort {
  const value = values.find((candidate): candidate is TimelineSort => (
    candidate === "importance" || candidate === "name" || candidate === "recent"
  ));
  if (value === undefined) throw new TimelineFailure("invalid-response");
  return value;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && error.name === "AbortError";
}
