import { useEffect, useState } from "react";

import { getSession } from "../api/auth";
import { listClusters } from "../api/clusters";
import {
  getTimelineCapabilities,
  getTimelineOverview,
  getTimelinePins,
} from "../api/timeline";
import type {
  TimelineEndpointCapabilityDescriptor,
  TimelineEndpointOverview,
  TimelineEndpointPinSet,
  TimelineOverviewRequest,
} from "../api/timeline-schemas";

// UI-PHASE2-001 §2 Timeline: typed live adapter (apiBoundary) for the /timeline
// surface. The former surface declared pins / live-stream / full snapshot
// "미지원" — this rewires to the real, existing endpoints:
//   GET  /api/timeline/capabilities  → server-owned control surface + bounds
//   POST /api/timeline/overview      → bucketed activity + facets + coverage
//   GET  /api/timeline/pins          → the workspace's persistent pin set
// The overview query is built strictly from the server capability descriptor so
// the request is always contract-valid. Only server-returned data renders; an
// empty window is an honest empty state, never an "endpoint unsupported" claim.

export type TimelineBoardStatus = "loading" | "ready" | "unavailable";

export interface TimelineActivityFacetView {
  activity: string;
  count: number;
}

export interface TimelineKindFacetView {
  kind: string;
  count: number;
}

export interface TimelinePinView {
  pinId: string;
  kind: "resource" | "application";
  label: string;
  sublabel: string | null;
}

export interface TimelinePinsView {
  status: "loading" | "ready" | "unavailable" | "unsupported";
  revision: number | null;
  items: TimelinePinView[];
}

export interface TimelineBoardView {
  /** Bootstrap status (session + clusters + capabilities). */
  status: TimelineBoardStatus;
  /** Overview read status; independent of pins. */
  overviewStatus: TimelineBoardStatus;
  scopeClusterId: string | null;
  windowFromMs: number | null;
  windowToMs: number | null;
  totalEvents: number;
  totalProblems: number;
  activityFacets: TimelineActivityFacetView[];
  kindFacets: TimelineKindFacetView[];
  coverageGaps: number;
  selectedSourceMode: string | null;
  availableSourceModes: string[];
  pins: TimelinePinsView;
}

const INITIAL: TimelineBoardView = {
  status: "loading",
  overviewStatus: "loading",
  scopeClusterId: null,
  windowFromMs: null,
  windowToMs: null,
  totalEvents: 0,
  totalProblems: 0,
  activityFacets: [],
  kindFacets: [],
  coverageGaps: 0,
  selectedSourceMode: null,
  availableSourceModes: [],
  pins: { status: "loading", revision: null, items: [] },
};

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

/**
 * Builds a contract-valid overview request from the server capability
 * descriptor. Returns null when the descriptor is missing a required control or
 * when the authorized window has no positive width (no queryable history yet).
 */
function buildOverviewRequest(
  capabilities: TimelineEndpointCapabilityDescriptor,
  workspaceId: string,
  clusterId: string,
): TimelineOverviewRequest | null {
  const surface = capabilities.control_surface;
  const view = surface.views[0]?.id;
  const grouping = surface.groupings[0]?.id;
  const sort = surface.sorts[0]?.id;
  const activity = surface.activity[0]?.activity ?? [];
  const bounds = capabilities.query_bounds;
  if (view === undefined || grouping === undefined || sort === undefined) return null;

  const range = surface.time_ranges.find((option) => option.id === surface.default_time_range_id);
  const span = Math.min(range?.duration_ms ?? capabilities.max_retained_range_ms, bounds.max_window_ms);
  const toMs = bounds.server_now_ms;
  const fromMs = Math.max(bounds.earliest_queryable_ms, toMs - span);
  if (fromMs >= toMs) return null;

  return {
    query: {
      scopes: [{ workspace_id: workspaceId, cluster_id: clusterId, namespaces: [], freshness: "live" }],
      window: { from_ms: fromMs, to_ms: toMs },
      filters: {
        activity: [...new Set(activity)].sort(),
        kinds: [],
        include_deleted: surface.deleted.default,
        pinned_only: false,
        query: "",
      },
      mode: "live",
      grouping,
      sort,
      view,
      range_id: surface.default_time_range_id,
      lens_zoom_rung: surface.default_lens_zoom_rung,
    },
  };
}

function toOverviewFields(overview: TimelineEndpointOverview): Pick<
  TimelineBoardView,
  "windowFromMs" | "windowToMs" | "totalEvents" | "totalProblems" | "activityFacets" | "kindFacets" | "coverageGaps"
> {
  const totals = overview.buckets.reduce(
    (accumulator, bucket) => ({
      events: accumulator.events + bucket.event_count,
      problems: accumulator.problems + bucket.problem_count,
    }),
    { events: 0, problems: 0 },
  );
  return {
    windowFromMs: overview.window.from_ms,
    windowToMs: overview.window.to_ms,
    totalEvents: totals.events,
    totalProblems: totals.problems,
    activityFacets: overview.facets.activity.map((facet) => ({ activity: facet.activity, count: facet.count })),
    kindFacets: overview.facets.kinds.map((facet) => ({ kind: facet.kind, count: facet.count })),
    coverageGaps: overview.coverage.length,
  };
}

function toPinView(pin: TimelineEndpointPinSet["pins"][number]): TimelinePinView {
  if (pin.subject.kind === "resource") {
    const resource = pin.subject.resource;
    return {
      pinId: pin.pin_id,
      kind: "resource",
      label: `${resource.kind} · ${resource.name}`,
      sublabel: resource.namespace ?? pin.subject.scope.cluster_id,
    };
  }
  return {
    pinId: pin.pin_id,
    kind: "application",
    label: pin.subject.snapshot.name,
    sublabel: pin.subject.snapshot.repository_id,
  };
}

/**
 * Runs the Timeline bootstrap once on mount: reads the session workspace, the
 * first session-visible cluster, the capability descriptor, then the overview
 * (scoped to that cluster) and the persistent pin set. Overview and pins fail
 * independently so one empty section never hides the other.
 */
export function useTimelineBoard(): TimelineBoardView {
  const [board, setBoard] = useState<TimelineBoardView>(INITIAL);
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    void (async () => {
      const [session, clusters, capabilities] = await Promise.all([
        getSession(signal),
        listClusters({}, signal),
        getTimelineCapabilities(signal),
      ]);
      if (signal.aborted) return;
      const clusterId = clusters.clusters[0]?.cluster_id ?? null;
      const workspaceId = session.workspace_id;
      const pinsAvailable = capabilities.control_surface.pins.availability === "available";

      // Overview (scoped to the representative cluster).
      let overviewFields: ReturnType<typeof toOverviewFields> | null = null;
      let overviewStatus: TimelineBoardStatus = "ready";
      if (clusterId !== null) {
        const request = buildOverviewRequest(capabilities, workspaceId, clusterId);
        if (request !== null) {
          try {
            const overview = await getTimelineOverview(request, signal);
            if (signal.aborted) return;
            overviewFields = toOverviewFields(overview);
          } catch (cause) {
            if (signal.aborted || isAbortError(cause)) return;
            overviewStatus = "unavailable";
          }
        }
      }

      // Persistent pin set (independent of overview).
      let pins: TimelinePinsView;
      if (!pinsAvailable) {
        pins = { status: "unsupported", revision: null, items: [] };
      } else {
        try {
          const pinSet = await getTimelinePins(signal);
          if (signal.aborted) return;
          pins = { status: "ready", revision: pinSet.revision, items: pinSet.pins.map(toPinView) };
        } catch (cause) {
          if (signal.aborted || isAbortError(cause)) return;
          pins = { status: "unavailable", revision: null, items: [] };
        }
      }

      setBoard({
        status: "ready",
        overviewStatus,
        scopeClusterId: clusterId,
        windowFromMs: overviewFields?.windowFromMs ?? null,
        windowToMs: overviewFields?.windowToMs ?? null,
        totalEvents: overviewFields?.totalEvents ?? 0,
        totalProblems: overviewFields?.totalProblems ?? 0,
        activityFacets: overviewFields?.activityFacets ?? [],
        kindFacets: overviewFields?.kindFacets ?? [],
        coverageGaps: overviewFields?.coverageGaps ?? 0,
        selectedSourceMode: capabilities.selected_source_mode,
        availableSourceModes: [...capabilities.available_source_modes],
        pins,
      });
    })().catch((cause: unknown) => {
      if (signal.aborted || isAbortError(cause)) return;
      setBoard((prev) => ({ ...prev, status: "unavailable", overviewStatus: "unavailable", pins: { status: "unavailable", revision: null, items: [] } }));
    });
    return () => controller.abort();
  }, []);
  return board;
}
