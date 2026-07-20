import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import type { I18nController } from "../../shared/i18n";
import type { MessageKey } from "../../shared/i18n/types";
import { Button } from "../../shared/ui/primitives/button";
import type {
  TimelineEvent,
  TimelineGrouping,
  TimelineSeverity,
  TimelineSort,
  TimelineEventType,
} from "../../features/timeline/timelineContract";
import type { TimelineEventGroup } from "../../features/timeline/timelinePresentation";
import {
  chronologicalTimelineEvents,
  timelinePositionPercent,
} from "../../features/timeline/timelinePresentation";
import { TIMELINE_SOURCE_LABEL } from "./timelineLabels";

const TYPE_LABEL: Record<TimelineEventType, MessageKey> = {
  add: "timeline.type.add",
  update: "timeline.type.update",
  delete: "timeline.type.delete",
  k8s_event: "timeline.type.k8sEvent",
  incident: "timeline.type.incident",
  deployment: "timeline.type.deployment",
  gitops_change: "timeline.type.gitopsChange",
};

const SEVERITY_LABEL: Record<TimelineSeverity, MessageKey> = {
  info: "timeline.severity.info",
  warning: "timeline.severity.warning",
  critical: "timeline.severity.critical",
  unknown: "timeline.severity.unknown",
};

export interface TimelineEventInteraction {
  selectedEventKey: string | null;
  onNavigate: (event: TimelineEvent, direction: -1 | 1) => void;
  onSelect: (event: TimelineEvent, origin: HTMLButtonElement) => void;
  registerControl: (event: TimelineEvent, control: HTMLButtonElement | null) => void;
}

interface TimelineEventViewProps {
  formatDate: I18nController["formatDate"];
  grouping: TimelineGrouping;
  groups: readonly TimelineEventGroup[];
  interaction: TimelineEventInteraction;
  sort: TimelineSort;
  t: I18nController["t"];
}

export function TimelineEventList({
  formatDate,
  grouping: _grouping,
  groups,
  interaction,
  sort: _sort,
  t,
}: TimelineEventViewProps) {
  const isFlat = groups.length === 1 && groups[0]?.label === null;
  if (isFlat) {
    return (
      <ol aria-label={t("timeline.list.label")} className="min-w-0 overflow-hidden rounded-card border bg-card">
        {groups[0]?.events.map((event) => (
          <TimelineEventListItem
            event={event}
            formatDate={formatDate}
            interaction={interaction}
            key={event.sourceKey}
            t={t}
          />
        ))}
      </ol>
    );
  }
  return (
    <div aria-label={t("timeline.list.label")} className="grid min-w-0 gap-3" role="list">
      {groups.map((group) => (
        <section className="min-w-0 overflow-hidden rounded-card border bg-card" data-timeline-group={group.id} key={group.id}>
          <h3 className="min-w-0 truncate border-b bg-muted/35 px-3.5 py-2 text-label font-semibold text-muted-foreground" title={group.label ?? undefined}>
            {group.label}
          </h3>
          <ol className="min-w-0">
            {group.events.map((event) => (
              <TimelineEventListItem
                event={event}
                formatDate={formatDate}
                interaction={interaction}
                key={event.sourceKey}
                t={t}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function TimelineSwimlane({
  formatDate,
  grouping,
  groups,
  interaction,
  sort,
  t,
}: TimelineEventViewProps) {
  const allEvents = groups.flatMap((group) => group.events);
  return (
    <section
      aria-label={t("timeline.swimlane.label")}
      className="min-w-0 overflow-hidden rounded-xl border bg-card p-3 shadow-sm"
      data-timeline-grouping={grouping}
      data-timeline-sort={sort}
      role="region"
    >
      <TimelineAxisScroller groups={groups} t={t}>
        <div className="grid min-w-[32rem] gap-3">
          {groups.map((group) => (
            <TimelineSwimlaneRow
              allEvents={allEvents}
              formatDate={formatDate}
              group={group}
              interaction={interaction}
              key={group.id}
              t={t}
            />
          ))}
        </div>
      </TimelineAxisScroller>
    </section>
  );
}

const SCROLL_EDGE_TOLERANCE = 1;

interface TimelineAxisScrollState {
  hasOverflow: boolean;
  canScrollBackward: boolean;
  canScrollForward: boolean;
}

const EMPTY_AXIS_SCROLL_STATE: TimelineAxisScrollState = {
  hasOverflow: false,
  canScrollBackward: false,
  canScrollForward: false,
};

function TimelineAxisScroller({
  children,
  groups,
  t,
}: {
  children: ReactNode;
  groups: readonly TimelineEventGroup[];
  t: I18nController["t"];
}) {
  const reducedMotion = usePrefersReducedMotion();
  const viewportId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<TimelineAxisScrollState>(EMPTY_AXIS_SCROLL_STATE);
  const syncScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const next = timelineAxisScrollState(viewport);
    setScrollState((current) => (
      current.hasOverflow === next.hasOverflow
      && current.canScrollBackward === next.canScrollBackward
      && current.canScrollForward === next.canScrollForward
        ? current
        : next
    ));
  }, []);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    syncScrollState();
    viewport.addEventListener("scroll", syncScrollState, { passive: true });
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(syncScrollState);
    resizeObserver?.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", syncScrollState);
      resizeObserver?.disconnect();
    };
  }, [groups, syncScrollState]);

  const scrollTo = useCallback((left: number) => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    viewport.scrollTo({
      left,
      behavior: reducedMotion ? "auto" : "smooth",
    });
    syncScrollState();
  }, [reducedMotion, syncScrollState]);
  const scrollByPage = useCallback((direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    scrollTo(viewport.scrollLeft + direction * viewport.clientWidth);
  }, [scrollTo]);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target || !scrollState.hasOverflow) return;
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      scrollByPage(-1);
    } else if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      scrollByPage(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      scrollTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      const viewport = viewportRef.current;
      if (viewport !== null) scrollTo(viewport.scrollWidth - viewport.clientWidth);
    }
  };
  const hint = timelineAxisScrollHint(scrollState, t);

  return (
    <div className="grid min-w-0 gap-2">
      {hint === null ? null : (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" id={`${viewportId}-hint`} role="status">
            {hint}
          </p>
          <div aria-label={t("timeline.swimlane.axis")} className="flex shrink-0 items-center gap-1" role="group">
            <Button
              aria-controls={viewportId}
              aria-label={t("timeline.swimlane.scroll.previous")}
              disabled={!scrollState.canScrollBackward}
              onClick={() => scrollByPage(-1)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              aria-controls={viewportId}
              aria-label={t("timeline.swimlane.scroll.next")}
              disabled={!scrollState.canScrollForward}
              onClick={() => scrollByPage(1)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
      <div
        aria-describedby={hint === null ? undefined : `${viewportId}-hint`}
        aria-label={t("timeline.swimlane.axis")}
        className="overflow-x-auto overscroll-x-contain rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        data-slot="timeline-axis-scroll"
        id={viewportId}
        onKeyDown={handleKeyDown}
        ref={viewportRef}
        role="group"
        tabIndex={scrollState.hasOverflow ? 0 : -1}
      >
        {children}
      </div>
    </div>
  );
}

function timelineAxisScrollState(viewport: HTMLDivElement): TimelineAxisScrollState {
  const maximumScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const hasOverflow = maximumScrollLeft > SCROLL_EDGE_TOLERANCE;
  return {
    hasOverflow,
    canScrollBackward: hasOverflow && viewport.scrollLeft > SCROLL_EDGE_TOLERANCE,
    canScrollForward: hasOverflow && viewport.scrollLeft < maximumScrollLeft - SCROLL_EDGE_TOLERANCE,
  };
}

function timelineAxisScrollHint(
  state: TimelineAxisScrollState,
  t: I18nController["t"],
): string | null {
  if (!state.hasOverflow) return null;
  if (state.canScrollBackward && state.canScrollForward) return t("timeline.swimlane.scroll.moreBoth");
  if (state.canScrollBackward) return t("timeline.swimlane.scroll.moreLeft");
  return t("timeline.swimlane.scroll.moreRight");
}

function TimelineEventListItem({
  event,
  formatDate,
  interaction,
  t,
}: {
  event: TimelineEvent;
  formatDate: I18nController["formatDate"];
  interaction: TimelineEventInteraction;
  t: I18nController["t"];
}) {
  return (
    <li className="min-w-0">
      <EventControl
        className="grid w-full min-w-0 animate-in grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-border-subtle bg-card px-3.5 py-2.5 text-left fade-in-0 slide-in-from-bottom-1 duration-(--motion-soft) ease-(--ease-soft) last:border-b-0 hover:bg-muted/35 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 data-[selected=true]:bg-tint-blue-bg/60 motion-reduce:animate-none motion-reduce:transition-none"
        event={event}
        interaction={interaction}
      >
        <span className="min-w-0 truncate text-label-2 font-semibold" title={event.title}>{event.title}</span>
        <time className="row-span-2 shrink-0 whitespace-nowrap font-mono text-caption text-muted-foreground" dateTime={event.occurredAt}>
          {formatDate(new Date(event.occurredAt), { dateStyle: "medium", timeStyle: "short" })}
        </time>
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-caption text-muted-foreground">
          <span className="shrink-0 rounded-md border px-2 py-0.5">{t(TIMELINE_SOURCE_LABEL[event.source])}</span>
          <span className="shrink-0 rounded-md border px-2 py-0.5">{t(TYPE_LABEL[event.type])}</span>
          <span className={severityClass(event.severity)}>{t(SEVERITY_LABEL[event.severity])}</span>
          <span className="min-w-0 truncate py-0.5" title={event.scope.clusterId}>{event.scope.clusterId}</span>
        </span>
      </EventControl>
    </li>
  );
}

function TimelineSwimlaneRow({
  allEvents,
  formatDate,
  group,
  interaction,
  t,
}: {
  allEvents: readonly TimelineEvent[];
  formatDate: I18nController["formatDate"];
  group: TimelineEventGroup;
  interaction: TimelineEventInteraction;
  t: I18nController["t"];
}) {
  const events = chronologicalTimelineEvents(group.events);
  return (
    <div
      className="grid grid-cols-[minmax(7rem,12rem)_minmax(18rem,1fr)] gap-3"
      data-timeline-lane
      data-timeline-group={group.id}
    >
      <h3 className="min-w-0 self-center truncate text-sm font-medium" title={group.label ?? undefined}>
        {group.label ?? t("timeline.list.label")}
      </h3>
      <div className="relative h-16 rounded-lg border bg-muted/20" role="list">
        <div aria-hidden="true" className="absolute top-1/2 right-2 left-2 border-t border-dashed" />
        {events.map((event, index) => (
          <EventControl
            ariaLabel={event.title}
            className={`absolute z-10 size-6 -translate-x-1/2 rounded-full focus-visible:ring-3 focus-visible:ring-ring/40 ${index % 2 === 0 ? "top-3" : "top-9"}`}
            dataTimelineMarker
            event={event}
            interaction={interaction}
            key={event.sourceKey}
            style={{ left: `clamp(0.75rem, ${timelinePositionPercent(event, allEvents)}%, calc(100% - 0.75rem))` }}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-1 rounded-full border-2 border-background ${markerClass(event.severity)}`}
            />
            <span className="sr-only">{event.title}</span>
            <span aria-hidden="true" className="sr-only">
              {formatDate(new Date(event.occurredAt), { dateStyle: "medium", timeStyle: "medium" })}
            </span>
          </EventControl>
        ))}
      </div>
    </div>
  );
}

function EventControl({
  ariaLabel,
  children,
  className,
  dataTimelineMarker = false,
  event,
  interaction,
  style,
}: {
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  dataTimelineMarker?: boolean;
  event: TimelineEvent;
  interaction: TimelineEventInteraction;
  style?: CSSProperties;
}) {
  const selected = interaction.selectedEventKey === event.sourceKey;
  return (
    <button
      aria-current={selected ? "true" : undefined}
      aria-label={ariaLabel ?? event.title}
      className={className}
      data-event-id={event.id}
      data-event-key={event.sourceKey}
      data-selected={selected || undefined}
      data-timeline-event-control
      data-timeline-marker={dataTimelineMarker || undefined}
      data-timeline-time={dataTimelineMarker ? event.occurredAt : undefined}
      onClick={(clickEvent) => interaction.onSelect(event, clickEvent.currentTarget)}
      onKeyDown={(keyEvent) => navigateWithArrow(keyEvent, event, interaction)}
      ref={(element) => interaction.registerControl(event, element)}
      style={style}
      type="button"
    >
      {children}
    </button>
  );
}

function navigateWithArrow(
  event: KeyboardEvent<HTMLButtonElement>,
  timelineEvent: TimelineEvent,
  interaction: TimelineEventInteraction,
) {
  const direction = event.key === "ArrowDown" || event.key === "ArrowRight"
    ? 1
    : event.key === "ArrowUp" || event.key === "ArrowLeft"
      ? -1
      : null;
  if (direction === null) return;
  event.preventDefault();
  interaction.onNavigate(timelineEvent, direction);
}

function severityClass(severity: TimelineSeverity): string {
  if (severity === "critical") return "rounded-md border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-destructive";
  if (severity === "warning") return "rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-amber-700 dark:text-amber-300";
  return "rounded-md border px-2 py-0.5";
}

function markerClass(severity: TimelineSeverity): string {
  if (severity === "critical") return "bg-destructive";
  if (severity === "warning") return "bg-amber-500";
  return "bg-primary";
}
