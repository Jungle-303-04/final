import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
} from "react";
import { useI18n, type I18nController } from "../../shared/i18n";
import type { MessageKey } from "../../shared/i18n/types";
import { ProductFloatingActionAvoidance } from "../../shared/ui/ProductFloatingActionAvoidance";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { LiveStatusDot, type LiveStatusDotTone } from "../../shared/ui/LiveStatusDot";
import { Button } from "../../shared/ui/primitives/button";
import type {
  TimelineEvent,
  TimelineGrouping,
  TimelinePort,
  TimelineQuery,
  TimelineStreamLifecycle,
  TimelineSort,
  TimelineViewMode,
} from "../../features/timeline/timelineContract";
import { groupTimelineEvents } from "../../features/timeline/timelinePresentation";
import { useTimelineUrlState } from "../../features/timeline/useTimelineUrlState";
import type { ClusterScope } from "../../shared/parity/referenceParity";
import { useTimelineDataFrame, type TimelineDataFrame } from "./useTimelineDataFrame";
import { TimelineEventDetailSheet } from "./TimelineEventDetailSheet";
import {
  TimelineEventList,
  TimelineSwimlane,
  type TimelineEventInteraction,
} from "./TimelineEventViews";
import { TimelineCoverageNotice } from "./TimelineCoverageNotice";

const VIEW_MODES: readonly TimelineViewMode[] = ["list", "swimlane"];

export function TimelineSurface({
  port,
  scopes,
}: {
  port: TimelinePort;
  scopes: readonly ClusterScope[];
}) {
  const { formatDate, formatNumber, t } = useI18n();
  const capabilities = port.capabilities;
  const url = useTimelineUrlState({
    isRetained: capabilities.selectedSourceMode === "retained",
    maxRetainedRangeMs: capabilities.maxRetainedRangeMs,
    requiresNamespaceFilter: capabilities.namespaceFilterPolicy === "required",
  });
  const query = useMemo<TimelineQuery>(() => ({
    scopes,
    mode: url.state.mode,
    filters: {
      activity: url.state.activityFilter,
      kinds: url.state.kindFilter,
      showDeleted: url.state.showDeleted,
      pinnedOnly: url.state.pinnedOnly,
      search: url.state.search,
      grouping: url.state.grouping,
      sort: url.state.sort,
      selectedEventKey: url.state.selectedEventKey,
    },
  }), [scopes, url.state]);
  const timeline = useTimelineDataFrame(port, query);
  const viewGroupRef = useRef<HTMLDivElement>(null);
  const namespaceLocked = capabilities.namespaceFilterPolicy === "required";

  const setViewMode = (viewMode: TimelineViewMode) => {
    if (namespaceLocked && viewMode !== "list") return;
    url.setViewMode(viewMode);
  };
  const navigateViewMode = (event: KeyboardEvent<HTMLDivElement>) => {
    const available = namespaceLocked ? ["list"] as const : VIEW_MODES;
    const currentIndex = available.indexOf(url.state.viewMode);
    const key = event.key;
    const nextIndex = key === "Home"
      ? 0
      : key === "End"
        ? available.length - 1
        : key === "ArrowRight" || key === "ArrowDown"
          ? (currentIndex + 1) % available.length
          : key === "ArrowLeft" || key === "ArrowUp"
            ? (currentIndex - 1 + available.length) % available.length
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = available[nextIndex] ?? "list";
    setViewMode(next);
    viewGroupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-timeline-view="${next}"]`)
      ?.focus();
  };

  return (
    <ProductPageFrame>
      <header className="grid min-w-0 gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{t("timeline.title")}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("timeline.description")}
        </p>
      </header>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium">
          <span>{t("timeline.search")}</span>
          <input
            aria-label={t("timeline.search")}
            className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => url.setSearch(event.currentTarget.value)}
            type="search"
            value={url.state.search}
          />
        </label>
        <div
          aria-label={t("timeline.view")}
          className="flex items-center gap-1"
          onKeyDown={navigateViewMode}
          ref={viewGroupRef}
          role="radiogroup"
        >
          <Button
            aria-checked={url.state.viewMode === "list"}
            data-timeline-view="list"
            onClick={() => setViewMode("list")}
            role="radio"
            size="sm"
            tabIndex={url.state.viewMode === "list" ? 0 : -1}
            type="button"
            variant={url.state.viewMode === "list" ? "secondary" : "ghost"}
          >
            {t("timeline.view.list")}
          </Button>
          <Button
            aria-checked={url.state.viewMode === "swimlane"}
            aria-disabled={namespaceLocked}
            data-timeline-view="swimlane"
            disabled={namespaceLocked}
            onClick={() => setViewMode("swimlane")}
            role="radio"
            size="sm"
            tabIndex={url.state.viewMode === "swimlane" && !namespaceLocked ? 0 : -1}
            type="button"
            variant={url.state.viewMode === "swimlane" ? "secondary" : "ghost"}
          >
            {t("timeline.view.swimlane")}
          </Button>
        </div>
      </div>
      <ProductFloatingActionAvoidance>
        <TimelineDataBoundary
          formatDate={formatDate}
          formatNumber={formatNumber}
          frame={timeline.frame}
          grouping={url.state.grouping}
          onRetry={timeline.retry}
          onSelectedEventKeyChange={url.setSelectedEventKey}
          selectedEventKey={url.state.selectedEventKey}
          sort={url.state.sort}
          t={t}
          viewMode={url.state.viewMode}
        />
      </ProductFloatingActionAvoidance>
    </ProductPageFrame>
  );
}

function TimelineDataBoundary({
  formatDate,
  formatNumber,
  frame,
  grouping,
  onRetry,
  onSelectedEventKeyChange,
  selectedEventKey,
  sort,
  t,
  viewMode,
}: {
  formatDate: I18nController["formatDate"];
  formatNumber: I18nController["formatNumber"];
  frame: TimelineDataFrame;
  grouping: TimelineGrouping;
  onRetry: () => void;
  onSelectedEventKeyChange: (sourceKey: string | null) => void;
  selectedEventKey: string | null;
  sort: TimelineSort;
  t: I18nController["t"];
  viewMode: TimelineViewMode;
}) {
  if (frame.phase === "loading") {
    return <p aria-live="polite" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground" role="status">{t("timeline.loading")}</p>;
  }
  if (frame.phase === "failed") {
    return (
      <section className="grid gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6" role="alert">
        <div>
          <h3 className="font-semibold">{t("timeline.error.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("timeline.error.description")}</p>
        </div>
        <div><Button aria-label={t("timeline.action.retry")} onClick={onRetry} type="button" variant="outline">{t("timeline.action.retry")}</Button></div>
      </section>
    );
  }
  return (
    <TimelineReadyData
      formatDate={formatDate}
      formatNumber={formatNumber}
      frame={frame}
      grouping={grouping}
      onRetry={onRetry}
      onSelectedEventKeyChange={onSelectedEventKeyChange}
      selectedEventKey={selectedEventKey}
      sort={sort}
      t={t}
      viewMode={viewMode}
    />
  );
}

function TimelineReadyData({
  formatDate,
  formatNumber,
  frame,
  grouping,
  onRetry,
  onSelectedEventKeyChange,
  selectedEventKey,
  sort,
  t,
  viewMode,
}: {
  formatDate: I18nController["formatDate"];
  formatNumber: I18nController["formatNumber"];
  frame: Exclude<TimelineDataFrame, { phase: "loading" } | { phase: "failed" }>;
  grouping: TimelineGrouping;
  onRetry: () => void;
  onSelectedEventKeyChange: (sourceKey: string | null) => void;
  selectedEventKey: string | null;
  sort: TimelineSort;
  t: I18nController["t"];
  viewMode: TimelineViewMode;
}) {
  const snapshot = frame.snapshot;
  const groups = useMemo(
    () => groupTimelineEvents(snapshot.events, grouping, sort),
    [grouping, snapshot.events, sort],
  );
  const presentedEvents = useMemo(
    () => groups.flatMap((group) => group.events),
    [groups],
  );
  const selectedEvent = useMemo(
    () => presentedEvents.find((event) => event.sourceKey === selectedEventKey) ?? null,
    [presentedEvents, selectedEventKey],
  );
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const focusOrigin = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (selectedEventKey !== null || !restoreFocus.current) return;
    restoreFocus.current = false;
    const origin = focusOrigin.current;
    if (origin?.isConnected) origin.focus();
  }, [selectedEventKey]);

  const registerControl = useCallback((event: TimelineEvent, control: HTMLButtonElement | null) => {
    if (control === null) controls.current.delete(event.sourceKey);
    else controls.current.set(event.sourceKey, control);
  }, []);
  const selectEvent = useCallback((event: TimelineEvent, origin: HTMLButtonElement) => {
    focusOrigin.current = origin;
    onSelectedEventKeyChange(event.sourceKey);
  }, [onSelectedEventKeyChange]);
  const navigateEvent = useCallback((event: TimelineEvent, direction: -1 | 1) => {
    const index = presentedEvents.findIndex((item) => item.sourceKey === event.sourceKey);
    const target = presentedEvents[index + direction];
    if (target === undefined) return;
    focusOrigin.current = controls.current.get(target.sourceKey) ?? focusOrigin.current;
    onSelectedEventKeyChange(target.sourceKey);
  }, [onSelectedEventKeyChange, presentedEvents]);
  const closeEvent = useCallback(() => {
    restoreFocus.current = true;
    onSelectedEventKeyChange(null);
  }, [onSelectedEventKeyChange]);
  const interaction = useMemo<TimelineEventInteraction>(() => ({
    selectedEventKey,
    onNavigate: navigateEvent,
    onSelect: selectEvent,
    registerControl,
  }), [navigateEvent, registerControl, selectEvent, selectedEventKey]);

  return (
    <>
      <section className="grid min-w-0 gap-3" data-timeline-view={viewMode}>
        <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
          {t(
            snapshot.events.length === 1 ? "timeline.count.one" : "timeline.count.other",
            { count: formatNumber(snapshot.events.length) },
          )}
        </p>
        {frame.phase === "resyncing" ? (
          frame.failure === null ? (
            <p aria-live="polite" className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground" role="status">
              {t("timeline.stream.resyncing")}
            </p>
          ) : (
            <TimelineRetryableFailure onRetry={onRetry} t={t} />
          )
        ) : <TimelineStreamStatus onRetry={onRetry} stream={frame.stream} t={t} />}
        <TimelineCoverageNotice coverage={snapshot.coverage} formatDate={formatDate} t={t} />
        {snapshot.events.length === 0 ? (
          <TimelineEmptyState coverageCount={snapshot.coverage.length} filters={snapshot.session.query.filters} t={t} />
        ) : viewMode === "list" ? (
          <TimelineEventList
            formatDate={formatDate}
            grouping={grouping}
            groups={groups}
            interaction={interaction}
            sort={sort}
            t={t}
          />
        ) : (
          <TimelineSwimlane
            formatDate={formatDate}
            grouping={grouping}
            groups={groups}
            interaction={interaction}
            sort={sort}
            t={t}
          />
        )}
      </section>
      <TimelineEventDetailSheet
        event={selectedEvent}
        formatDate={formatDate}
        onClose={closeEvent}
        onNavigate={(direction) => { if (selectedEvent !== null) navigateEvent(selectedEvent, direction); }}
        t={t}
      />
    </>
  );
}

function TimelineEmptyState({
  coverageCount,
  filters,
  t,
}: {
  coverageCount: number;
  filters: TimelineQuery["filters"];
  t: I18nController["t"];
}) {
  const key = coverageCount > 0
    ? "timeline.empty.coverage"
    : hasAppliedFilters(filters)
      ? "timeline.empty.filtered"
      : "timeline.empty.quiet";
  return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t(key)}</p>;
}

function hasAppliedFilters(filters: TimelineQuery["filters"]): boolean {
  return filters.search.trim().length > 0
    || filters.activity.length > 0
    || filters.kinds.length > 0
    || !filters.showDeleted
    || filters.pinnedOnly;
}

function TimelineStreamStatus({
  onRetry,
  stream,
  t,
}: {
  onRetry: () => void;
  stream: TimelineStreamLifecycle;
  t: I18nController["t"];
}) {
  if (stream.state === "failed") {
    return <TimelineRetryableFailure onRetry={onRetry} t={t} />;
  }
  const presentation = streamStatusPresentation(stream.state);
  return (
    <div
      aria-live="polite"
      className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
      data-stream-state={stream.state}
      role="status"
    >
      <LiveStatusDot state={stream.state} tone={presentation.tone} />
      <span>{t(presentation.key)}</span>
    </div>
  );
}

function streamStatusPresentation(
  state: Exclude<TimelineStreamLifecycle["state"], "failed">,
): { key: MessageKey; tone: LiveStatusDotTone } {
  if (state === "connected") return { key: "timeline.stream.connected", tone: "healthy" };
  if (state === "connecting") return { key: "timeline.stream.connecting", tone: "warning" };
  if (state === "reconnecting") return { key: "timeline.stream.reconnecting", tone: "warning" };
  return { key: "timeline.stream.closed", tone: "stale" };
}

function TimelineRetryableFailure({
  onRetry,
  t,
}: {
  onRetry: () => void;
  t: I18nController["t"];
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3" role="alert">
      <div>
        <h3 className="font-medium">{t("timeline.error.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("timeline.error.description")}</p>
      </div>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">{t("timeline.action.retry")}</Button>
    </section>
  );
}
