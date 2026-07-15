import { useEffect, useMemo, useState } from "react";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { Button } from "../../shared/ui/primitives/button";
import type {
  TimelineFailure,
  TimelinePort,
  TimelineQuery,
  TimelineScope,
} from "../../features/timeline/timelineContract";
import { TimelineFailure as TimelinePortFailure } from "../../features/timeline/timelineContract";
import { DEFAULT_MAX_RANGE_DAYS } from "../../features/timeline/timelineUrlState";
import { useTimelineUrlState } from "../../features/timeline/useTimelineUrlState";

type TimelineLoadState =
  | { phase: "loading" }
  | { phase: "ready"; eventCount: number }
  | { phase: "failed"; failure: TimelineFailure };

interface TimelineResolution {
  requestSignature: string;
  state: Exclude<TimelineLoadState, { phase: "loading" }>;
}

export function TimelineSurface({ port, scope }: { port: TimelinePort; scope: TimelineScope }) {
  const url = useTimelineUrlState({
    isRetained: port.capabilities.sourceMode === "retained",
    maxRangeDays: port.capabilities.maxRangeDays ?? DEFAULT_MAX_RANGE_DAYS,
    requiresNamespaceFilter: port.capabilities.requiresNamespaceFilter,
  });
  const query = useMemo<TimelineQuery>(() => ({
    scope,
    mode: url.state.mode,
    filters: {
      activity: url.state.activityFilter,
      kinds: url.state.kindFilter,
      showDeleted: url.state.showDeleted,
      pinnedOnly: url.state.pinnedOnly,
      search: url.state.search,
      grouping: url.state.grouping,
      sort: url.state.sort,
      selectedEventId: url.state.selectedEventId,
    },
  }), [scope, url.state]);
  const [reloadToken, setReloadToken] = useState(0);
  const requestSignature = useMemo(
    () => JSON.stringify({ query, reloadToken }),
    [query, reloadToken],
  );
  const [resolution, setResolution] = useState<TimelineResolution | null>(null);
  const loadState: TimelineLoadState = resolution?.requestSignature === requestSignature
    ? resolution.state
    : { phase: "loading" };

  useEffect(() => {
    const controller = new AbortController();
    void port.readTimeline(query, controller.signal)
      .then((snapshot) => {
        if (controller.signal.aborted) return;
        if (!Number.isSafeInteger(snapshot.eventCount) || snapshot.eventCount < 0) {
          setResolution({
            requestSignature,
            state: { phase: "failed", failure: new TimelinePortFailure("invalid-response") },
          });
          return;
        }
        setResolution({ requestSignature, state: { phase: "ready", eventCount: snapshot.eventCount } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResolution({
          requestSignature,
          state: { phase: "failed", failure: toTimelineFailure(error) },
        });
      });
    return () => controller.abort();
  }, [port, query, requestSignature]);

  const namespaceLocked = port.capabilities.requiresNamespaceFilter;
  return (
    <ProductPageFrame>
      <header className="grid min-w-0 gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">Timeline</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Timeline filters are shareable through the URL. Visualization and event-detail interactions are being mapped in later slices.
        </p>
      </header>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium">
          <span>Timeline search</span>
          <input
            aria-label="Timeline search"
            className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => url.setSearch(event.currentTarget.value)}
            type="search"
            value={url.state.search}
          />
        </label>
        <div aria-label="Timeline view" className="flex items-center gap-1" role="radiogroup">
          <Button
            aria-checked={url.state.viewMode === "list"}
            onClick={() => url.setViewMode("list")}
            role="radio"
            size="sm"
            type="button"
            variant={url.state.viewMode === "list" ? "secondary" : "ghost"}
          >
            List
          </Button>
          <Button
            aria-checked={url.state.viewMode === "swimlane"}
            aria-disabled={namespaceLocked}
            disabled={namespaceLocked}
            onClick={() => url.setViewMode("swimlane")}
            role="radio"
            size="sm"
            type="button"
            variant={url.state.viewMode === "swimlane" ? "secondary" : "ghost"}
          >
            Swimlane
          </Button>
        </div>
      </div>
      <TimelineLoadBoundary loadState={loadState} onRetry={() => setReloadToken((token) => token + 1)} />
    </ProductPageFrame>
  );
}

function TimelineLoadBoundary({
  loadState,
  onRetry,
}: {
  loadState: TimelineLoadState;
  onRetry: () => void;
}) {
  if (loadState.phase === "loading") {
    return <p aria-live="polite" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground" role="status">Loading timeline data…</p>;
  }
  if (loadState.phase === "failed") {
    return (
      <section className="grid gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6" role="alert">
        <div>
          <h3 className="font-semibold">Timeline data is unavailable.</h3>
          <p className="mt-1 text-sm text-muted-foreground">The timeline service did not return a usable response.</p>
        </div>
        <div><Button aria-label="Retry timeline" onClick={onRetry} type="button" variant="outline">Retry</Button></div>
      </section>
    );
  }
  if (loadState.eventCount === 0) {
    return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No timeline events match this scope.</p>;
  }
  return (
    <p aria-live="polite" className="rounded-xl border bg-card p-6 text-sm" role="status">
      {loadState.eventCount} {loadState.eventCount === 1 ? "event" : "events"} are available for the selected scope.
    </p>
  );
}

function toTimelineFailure(error: unknown): TimelineFailure {
  return error instanceof TimelinePortFailure ? error : new TimelinePortFailure("unknown");
}
