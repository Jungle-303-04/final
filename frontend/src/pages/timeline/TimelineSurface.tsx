import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useI18n, type I18nController } from "../../shared/i18n";
import type { MessageKey } from "../../shared/i18n/types";
import { ProductFloatingActionAvoidance } from "../../shared/ui/ProductFloatingActionAvoidance";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { LiveStatusDot, type LiveStatusDotTone } from "../../shared/ui/LiveStatusDot";
import { Button } from "../../shared/ui/primitives/button";
import {
  timelineActivityKeysFromActivities,
  type TimelineEvent,
  type TimelineCapabilities,
  type TimelineControlSelection,
  type TimelineGrouping,
  type TimelinePort,
  type TimelineQuery,
  type TimelineStreamLifecycle,
  type TimelineSort,
  type TimelineViewMode,
} from "../../features/timeline/timelineContract";
import {
  isSameTimelineUrlState,
  normalizeTimelineUrlStateForCapabilities,
  validateTimelineKinds,
} from "../../features/timeline/timelineControlState";
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
import { TimelineToolbar } from "./TimelineToolbar";
import { useTimelineOverviewFrame } from "./useTimelineOverviewFrame";

export function TimelineSurface({
  port,
  scopes,
}: {
  port: TimelinePort;
  scopes: readonly ClusterScope[];
}) {
  const { formatDate, formatNumber, t } = useI18n();
  const capabilities = port.capabilities;
  const urlOptions = useMemo(() => timelineUrlOptions(capabilities), [capabilities]);
  const url = useTimelineUrlState({
    ...urlOptions,
  });
  const normalizedState = useMemo(
    () => normalizeTimelineUrlStateForCapabilities(url.state, capabilities),
    [capabilities, url.state],
  );
  useEffect(() => {
    if (!isSameTimelineUrlState(url.state, normalizedState)) {
      url.replaceState(normalizedState);
    }
  }, [normalizedState, url]);

  const overviewQuery = useMemo<TimelineQuery>(() => ({
    scopes,
    mode: normalizedState.mode,
    control: timelineControlSelection(capabilities, normalizedState.viewMode, normalizedState.mode),
    filters: {
      activity: normalizedState.activityFilter,
      // Kinds are validated only against overview facets. The initial overview
      // deliberately has no kind filter so a deep link cannot request a
      // stale or unauthorized dynamic/CRD kind before its catalog arrives.
      kinds: [],
      showDeleted: normalizedState.showDeleted,
      pinnedOnly: false,
      search: normalizedState.search,
      grouping: normalizedState.grouping,
      sort: normalizedState.sort,
      selectedEventKey: normalizedState.selectedEventKey,
    },
  }), [capabilities, normalizedState, scopes]);
  const overview = useTimelineOverviewFrame(port, overviewQuery);
  const validatedKinds = useMemo(
    () => validateTimelineKinds(
      normalizedState.kindFilter,
      overview.frame.phase === "ready" ? overview.frame.overview : null,
    ),
    [normalizedState.kindFilter, overview.frame],
  );
  useEffect(() => {
    if (overview.frame.phase !== "ready" || sameStrings(normalizedState.kindFilter, validatedKinds)) return;
    url.replaceState({ ...normalizedState, kindFilter: validatedKinds });
  }, [normalizedState, overview.frame, url, validatedKinds]);
  const query = useMemo<TimelineQuery>(() => ({
    ...overviewQuery,
    filters: { ...overviewQuery.filters, kinds: validatedKinds },
  }), [overviewQuery, validatedKinds]);
  const timeline = useTimelineDataFrame(port, query);

  return (
    <ProductPageFrame>
      <header className="grid min-w-0 gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{t("timeline.title")}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("timeline.description")}
        </p>
      </header>
      <TimelineToolbar
        capabilities={capabilities}
        onActivityFilterChange={url.setActivityFilter}
        onGroupingChange={url.setGrouping}
        onKindFilterChange={url.setKindFilter}
        onSearchChange={url.setSearch}
        onShowDeletedChange={url.setShowDeleted}
        onSortChange={url.setSort}
        onViewModeChange={url.setViewMode}
        overview={overview.frame}
        state={normalizedState}
        t={t}
      />
      <ProductFloatingActionAvoidance>
        <TimelineDataBoundary
          formatDate={formatDate}
          formatNumber={formatNumber}
          frame={timeline.frame}
          grouping={normalizedState.grouping}
          onRetry={timeline.retry}
          onSelectedEventKeyChange={url.setSelectedEventKey}
          selectedEventKey={normalizedState.selectedEventKey}
          sort={normalizedState.sort}
          t={t}
          viewMode={normalizedState.viewMode}
        />
      </ProductFloatingActionAvoidance>
    </ProductPageFrame>
  );
}

function timelineUrlOptions(capabilities: TimelineCapabilities) {
  const controls = capabilities.controlSurface;
  return {
    isRetained: capabilities.selectedSourceMode === "retained",
    maxRetainedRangeMs: capabilities.maxRetainedRangeMs,
    requiresNamespaceFilter: capabilities.namespaceFilterPolicy === "required",
    defaultViewMode: requiredControlId<TimelineViewMode>(controls.views),
    defaultShowDeleted: controls.deleted.default,
    defaultActivityFilter: timelineActivityKeysFromActivities(requiredControl(controls.activity).activity),
    defaultGrouping: requiredControlId<TimelineGrouping>(controls.groupings),
    defaultSort: requiredControlId<TimelineSort>(controls.sorts),
  };
}

function requiredControlId<T extends string>(options: readonly { id: string }[]): T {
  return requiredControl(options).id as T;
}

function requiredControl<T>(options: readonly T[]): T {
  const control = options[0];
  if (control === undefined) throw new Error("Timeline capability descriptor omitted a required control.");
  return control;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Range and lens IDs always originate in the preflight descriptor, never a UI constant. */
function timelineControlSelection(
  capabilities: TimelineCapabilities,
  view: TimelineViewMode,
  mode: TimelineQuery["mode"],
): TimelineControlSelection {
  const selectedRange = mode.kind === "live"
    ? capabilities.controlSurface.timeRanges.find((range) => range.durationMs === mode.widthMs)
    : undefined;
  return {
    view,
    rangeId: selectedRange?.id ?? capabilities.controlSurface.customTimeRangeId,
    lensZoomRung: capabilities.controlSurface.defaultLensZoomRung,
  };
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
